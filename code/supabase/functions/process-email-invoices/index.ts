// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Imap from 'npm:imap-simple';
import { simpleParser } from 'npm:mailparser';
import { sendTransactionalEmail } from '../_shared/email.ts';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const RECIPIENT_HEADER_NAMES = ['delivered-to', 'x-original-to', 'envelope-to'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function normalizeEmailAddress(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
}

function addAddressCandidate(candidates, value) {
  if (!value) return;

  if (Array.isArray(value)) {
    for (const item of value) addAddressCandidate(candidates, item);
    return;
  }

  if (typeof value === 'string') {
    const matches = value.match(EMAIL_PATTERN) || [];
    for (const match of matches) {
      const normalized = normalizeEmailAddress(match);
      if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
    }
    return;
  }

  if (value.address) {
    addAddressCandidate(candidates, value.address);
  }

  if (value.text) {
    addAddressCandidate(candidates, value.text);
  }

  if (Array.isArray(value.value)) {
    for (const address of value.value) addAddressCandidate(candidates, address);
  }
}

function headerValues(headers, name) {
  if (!headers?.get) return [];
  const value = headers.get(name);
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function extractRecipientCandidates(parsed, mailboxUser = null) {
  const candidates = [];

  addAddressCandidate(candidates, parsed?.to);
  addAddressCandidate(candidates, parsed?.cc);

  for (const headerName of RECIPIENT_HEADER_NAMES) {
    for (const value of headerValues(parsed?.headers, headerName)) {
      addAddressCandidate(candidates, value);
    }
  }

  addAddressCandidate(candidates, mailboxUser);

  return candidates;
}

async function selectMatchedRecipient(supabase, candidates) {
  if (!candidates.length) return null;

  const { data, error } = await supabase
    .from('location_email_addresses')
    .select('email')
    .in('email', candidates)
    .eq('is_active', true)
    .is('deleted_at', null);

  if (error) throw error;

  const matchedEmails = new Set((data || []).map(row => row.email));
  return candidates.find(candidate => matchedEmails.has(candidate)) || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Fetch all active email IMAP configurations
    const { data: configs, error: configError } = await supabase
      .from('integrations')
      .select('*')
      .eq('provider', 'email_imap')
      .eq('is_active', true)

    if (configError) throw configError;
    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ message: "No active IMAP configurations found" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const results = [];

    // 2. Iterate and process each inbox
    for (const config of configs) {
      const orgId = config.metadata?.organization_id;
      const host = config.metadata?.host;
      const port = parseInt(config.metadata?.port || '993', 10);
      const user = config.metadata?.username;
      const password = config.metadata?.password;

      if (!host || !user || !password) continue;

      const imapConfig = {
        imap: {
          user: user,
          password: password,
          host: host,
          port: port,
          tls: true,
          authTimeout: 3000,
        }
      };

      try {
        const connection = await Imap.connect(imapConfig);
        await connection.openBox('INBOX');

        const searchCriteria = ['UNSEEN'];
        const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], struct: true, markSeen: true };

        const messages = await connection.search(searchCriteria, fetchOptions);

        for (const item of messages) {
          const all = item.parts.find(part => part.which === '');
          const id = item.attributes.uid;
          const idHeader = "Imap-Id: " + id + "\r\n";
          
          if (all) {
             const parsed = await simpleParser(idHeader + all.body);
             const recipientCandidates = extractRecipientCandidates(parsed, user);
             const matchedRecipient = await selectMatchedRecipient(supabase, recipientCandidates);
             const ingestRecipient = matchedRecipient || recipientCandidates[0] || user || null;
             
             // Extract PDF attachments
             const pdfAttachments = parsed.attachments.filter(att => att.contentType === 'application/pdf');
             
             for (const att of pdfAttachments) {
                // Here we would typically upload the PDF to Supabase Storage, 
                // send it to an OCR pipeline (like Document AI, AWS Textract, or a custom model),
                // and parse the text to extract invoice details.
                
                // For this implementation, we upload it to storage and create a pending review invoice.
                const filename = `${crypto.randomUUID()}_${att.filename.replace(/[^a-zA-Z0-9.]/g, '_')}`;
                const filePath = `auto-ingested/${filename}`;
                
                const { error: uploadError } = await supabase.storage
                  .from('invoices')
                  .upload(filePath, att.content, { contentType: 'application/pdf' });
                
                // 4. Inject into the approval workflow through the email-ingest RPC.
                // The RPC derives organization/brand/location from the matched recipient address.
                const { data: ingestResult, error: insertError } = await supabase.rpc('ingest_email_invoice', {
                  p_recipient_email: ingestRecipient,
                  p_fallback_organization_id: orgId || null,
                  p_invoice: {
                    file_url: filePath,
                    vendor_name: parsed.from?.text || 'Unknown Vendor (Auto-Ingested)',
                    invoice_number: `EMAIL-${id}-${Date.now()}`,
                    total_amount: 0,
                    ap_metadata: {
                      ingest_recipient_candidates: recipientCandidates,
                      matched_recipient: matchedRecipient,
                      mailbox_user: user,
                      imap_uid: id,
                      subject: parsed.subject || null,
                      attachment_filename: att.filename || null,
                      upload_error: uploadError?.message || null,
                    },
                  },
                });

                if (!insertError) {
                   console.log('Email invoice ingested', ingestResult);
                   if (ingestResult?.matched === false) {
                     const senderCandidates = [];
                     addAddressCandidate(senderCandidates, parsed.from);
                     const senderEmail = senderCandidates[0] || null;
                     if (senderEmail) {
                       try {
                         await sendTransactionalEmail({
                           to: senderEmail,
                           subject: 'Invoice could not be routed automatically',
                           text: 'We received your invoice, but could not match the recipient address to a registered restaurant location. Please upload the invoice manually in the app, or ask an organization admin to register this location email address before sending future invoices.',
                         });
                       } catch (emailError) {
                         console.error('Failed to send unmatched invoice routing notice:', emailError?.message || emailError);
                       }
                     }
                   }
                   if (ingestResult?.organization_id) {
                     // Move the file out of the flat, unscoped "auto-ingested/" path into the
                     // same organization_id/invoice_id convention the other two upload paths use,
                     // now that the org is known (it isn't until after ingest_email_invoice runs).
                     let finalFilePath = filePath;
                     const scopedFilePath = `${ingestResult.organization_id}/${ingestResult.invoice_id || 'pending'}/${filename}`;
                     const { error: moveError } = await supabase.storage
                       .from('invoices')
                       .move(filePath, scopedFilePath);
                     if (moveError) {
                       console.error('Failed to move invoice file to scoped path:', moveError.message);
                     } else {
                       finalFilePath = scopedFilePath;
                       if (ingestResult?.invoice_id) {
                         const { error: updateError } = await supabase
                           .from('invoices')
                           .update({ file_url: finalFilePath })
                           .eq('id', ingestResult.invoice_id);
                         if (updateError) {
                           console.error('Failed to update invoice file_url after move:', updateError.message);
                         }
                       }
                     }

                     const digest = await crypto.subtle.digest('SHA-256', att.content);
                     const fileHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');

                     // No human is in the loop for an automated email ingest, so a duplicate here
                     // can't be blocked with a confirm prompt like the interactive upload paths --
                     // instead flag it on the invoice so the reviewer sees it at approval time.
                     const { data: duplicates } = await supabase.rpc('find_duplicate_invoice_documents', {
                       p_organization_id: ingestResult.organization_id,
                       p_file_hash: fileHash,
                     });
                     const duplicateMatch = (duplicates || []).find((d) => d.invoice_id !== ingestResult?.invoice_id);
                     if (duplicateMatch && ingestResult?.invoice_id) {
                       const { error: flagError } = await supabase
                         .from('invoices')
                         .update({
                           ap_metadata: {
                             ...(ingestResult.ap_metadata || {}),
                             duplicate_warning: true,
                             duplicate_of_invoice_id: duplicateMatch.invoice_id,
                           },
                         })
                         .eq('id', ingestResult.invoice_id);
                       if (flagError) {
                         console.error('Failed to flag duplicate invoice:', flagError.message);
                       }
                     }

                     const { error: registerError } = await supabase.rpc('register_invoice_document', {
                       p_storage_path: finalFilePath,
                       p_file_name: att.filename,
                       p_file_type: 'application/pdf',
                       p_file_size: att.content.length,
                       p_file_hash: fileHash,
                       p_source: 'email',
                       p_invoice_id: ingestResult?.invoice_id || null,
                       p_organization_id: ingestResult.organization_id,
                     });
                     if (registerError) {
                       console.error('Failed to register invoice document metadata:', registerError.message);
                     }
                   }
                   results.push({
                     email: user,
                     subject: parsed.subject,
                     status: 'processed',
                     invoice_id: ingestResult?.invoice_id,
                     matched: ingestResult?.matched,
                     recipient: ingestResult?.recipient_email,
                     warning: ingestResult?.warning,
                   });
                } else {
                   results.push({ email: user, subject: parsed.subject, status: 'failed', error: insertError.message });
                }
             }
          }
        }
        
        connection.end();
      } catch (e) {
        console.error(`Error processing inbox ${user}:`, e);
        results.push({ email: user, error: e.message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})
