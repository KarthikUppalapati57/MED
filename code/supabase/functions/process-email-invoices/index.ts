// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Imap from 'npm:imap-simple';
import { simpleParser } from 'npm:mailparser';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
                
                // 4. Inject into the approval workflow
                // We set status to 'extracting' so that the pg_net webhook picks it up for Gemini Processing
                const { error: insertError } = await supabase.from('invoices').insert({
                   organization_id: orgId || null,
                   status: 'extracting', 
                   file_url: filePath,
                   vendor_name: parsed.from?.text || 'Unknown Vendor (Auto-Ingested)',
                   raw_text: parsed.text, // Store email body as context
                   invoice_number: `EMAIL-${id}-${Date.now()}`,
                   total_amount: 0,
                });

                if (!insertError) {
                   results.push({ email: user, subject: parsed.subject, status: 'processed' });
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
