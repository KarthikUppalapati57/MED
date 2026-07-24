import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const lastUpdated = 'July 24, 2026';

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">{title}</h2>
      <div className="space-y-2 text-slate-600 leading-relaxed">{children}</div>
    </section>
  );
}

export default function DataProcessingAddendum() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="border-b bg-white px-6 h-16 flex items-center shrink-0 sticky top-0 z-10">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4 -ml-2 text-slate-500">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-slate-900">Restops Platform</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">Data Processing Addendum</h1>
          <p className="text-sm text-slate-500 mb-8 pb-8 border-b border-slate-100">Last updated: {lastUpdated}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <Section title="1. Introduction">
                <p>This Data Processing Addendum ("DPA") forms part of the Terms of Service (the "Agreement") between [LEGAL ENTITY NAME] ("Restops") and the customer entity agreeing to the Agreement ("Customer"), and applies where Restops processes Customer Personal Data on Customer's behalf. Capitalized terms not defined here have the meaning given in the Agreement.</p>
              </Section>

              <Section title="2. Definitions">
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>"Customer Personal Data"</strong> means personal data submitted to the Platform by or on behalf of Customer, including data about Customer's personnel and vendor contacts, described in Annex 1.</li>
                  <li><strong>"Data Protection Laws"</strong> means applicable laws governing the processing of personal data, including U.S. state privacy laws and, if and when applicable, the EU/UK GDPR.</li>
                  <li><strong>"Sub-processor"</strong> means a third party engaged by Restops to process Customer Personal Data, listed in Annex 2.</li>
                  <li><strong>"Security Incident"</strong> means a confirmed breach of security leading to accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to, Customer Personal Data.</li>
                </ul>
              </Section>

              <Section title="3. Roles of the Parties">
                <p>As between the parties, Customer is the controller (or processor acting on behalf of a controller) of Customer Personal Data, and Restops is a processor acting on Customer's documented instructions, as set out in the Agreement, this DPA, and Customer's configuration and use of the Platform.</p>
              </Section>

              <Section title="4. Processing Instructions">
                <p>Restops will process Customer Personal Data only to provide, secure, and support the Platform in accordance with the Agreement and Customer's instructions given through use of the Platform, unless otherwise required by law, in which case Restops will inform Customer before processing unless prohibited from doing so.</p>
              </Section>

              <Section title="5. Confidentiality">
                <p>Restops ensures that personnel authorized to process Customer Personal Data are subject to confidentiality obligations and access data only as needed to perform their role.</p>
              </Section>

              <Section title="6. Security Measures">
                <p>Restops implements the measures described in its <a href="/security" className="text-indigo-600 no-underline hover:underline">Security Policy</a>, including role- and location-scoped access control, database-level row security, encrypted storage of sensitive tax and banking data, audit logging, and incident response procedures.</p>
              </Section>

              <Section title="7. Sub-processors">
                <p>Customer provides general authorization for Restops to engage the Sub-processors listed in Annex 2. Restops imposes data protection obligations on Sub-processors materially consistent with this DPA, and will give notice before adding a new Sub-processor (for example, by updating Annex 2 and the Privacy Policy Subprocessor List). Customer may object on reasonable data-protection grounds by contacting [LEGAL CONTACT EMAIL].</p>
              </Section>

              <Section title="8. Assistance with Data Subject Requests">
                <p>Taking into account the nature of processing, Restops will provide reasonable assistance to Customer in responding to verified requests from individuals to exercise their rights under applicable Data Protection Laws, including through Platform features that let Customer's administrators access, export, or delete data directly.</p>
              </Section>

              <Section title="9. Security Incident Notification">
                <p>Restops will notify Customer without undue delay after confirming a Security Incident affecting Customer Personal Data, and will provide information reasonably available to help Customer meet its own notification obligations. Notification is not an acknowledgment of fault or liability.</p>
              </Section>

              <Section title="10. Deletion or Return of Data">
                <p>On termination of the Agreement, Restops will make Customer Personal Data available for export for a reasonable period and will then delete it per the retention lifecycle in the Privacy Policy (active use, then a 30-day archive, then permanent deletion), except where a longer period is legally required, in which case only the minimum necessary data is retained.</p>
              </Section>

              <Section title="11. Audits">
                <p>Restops will make available information reasonably necessary to demonstrate compliance with this DPA and will allow audits as reasonably requested by Customer or a supervisory authority, subject to reasonable confidentiality, scheduling, and scope limitations, and no more than once annually absent a Security Incident or legal requirement.</p>
              </Section>

              <Section title="12. International Transfers">
                <p>The Platform currently serves customers in the United States, processed by the Sub-processors listed in Annex 2. If Customer's use involves personal data originating outside the United States, an appropriate transfer mechanism (such as Standard Contractual Clauses) will be incorporated here before that use begins.</p>
              </Section>

              <Section title="13. Liability and Term">
                <p>Each party's liability arising under this DPA is subject to the limitations of liability set out in the Agreement. This DPA remains in effect for as long as Restops processes Customer Personal Data under the Agreement.</p>
              </Section>

              <Section title="Annex 1 — Details of Processing">
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>Subject matter:</strong> provision of the Restops restaurant/hospitality operations platform.</li>
                  <li><strong>Duration:</strong> the term of the Agreement, plus the retention period described in Section 10.</li>
                  <li><strong>Nature and purpose:</strong> hosting, storage, and processing of Customer Personal Data to operate account access, vendor and invoice workflows, payments, AI-assisted extraction/assistance, and related support.</li>
                  <li><strong>Categories of data subjects:</strong> Customer's personnel and vendor contacts onboarded by Customer.</li>
                  <li><strong>Categories of personal data:</strong> name, email, phone, role/organization assignment, login metadata, and, where applicable, tax identifiers, W-9 information, and bank account details (encrypted, last-four visible in application tables).</li>
                </ul>
              </Section>

              <Section title="Annex 2 — Sub-processors">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50 text-slate-700">
                        <th className="text-left p-2 border border-slate-200">Sub-processor</th>
                        <th className="text-left p-2 border border-slate-200">Purpose</th>
                        <th className="text-left p-2 border border-slate-200">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td className="p-2 border border-slate-200">Supabase</td><td className="p-2 border border-slate-200">Auth, database, storage, backend functions</td><td className="p-2 border border-slate-200">Active</td></tr>
                      <tr><td className="p-2 border border-slate-200">Vercel</td><td className="p-2 border border-slate-200">Application hosting</td><td className="p-2 border border-slate-200">Active</td></tr>
                      <tr><td className="p-2 border border-slate-200">Azure OpenAI</td><td className="p-2 border border-slate-200">AI extraction and assistant/chatbot</td><td className="p-2 border border-slate-200">Active</td></tr>
                      <tr><td className="p-2 border border-slate-200">Stripe (ACH Debit & Connect Custom)</td><td className="p-2 border border-slate-200">Billing and payment processing</td><td className="p-2 border border-slate-200">Active</td></tr>
                      <tr><td className="p-2 border border-slate-200">Resend</td><td className="p-2 border border-slate-200">Transactional email</td><td className="p-2 border border-slate-200">Active</td></tr>
                      <tr><td className="p-2 border border-slate-200">Checkbook</td><td className="p-2 border border-slate-200">Vendor payouts (planned)</td><td className="p-2 border border-slate-200">Planned</td></tr>
                      <tr><td className="p-2 border border-slate-200">Dwolla</td><td className="p-2 border border-slate-200">ACH/payment option (planned)</td><td className="p-2 border border-slate-200">Planned</td></tr>
                      <tr><td className="p-2 border border-slate-200">Plaid</td><td className="p-2 border border-slate-200">Bank-linking/verification (planned)</td><td className="p-2 border border-slate-200">Planned</td></tr>
                      <tr><td className="p-2 border border-slate-200">Google Cloud Run</td><td className="p-2 border border-slate-200">Document extraction hosting (planned)</td><td className="p-2 border border-slate-200">Planned</td></tr>
                    </tbody>
                  </table>
                </div>
                <p>Planned Sub-processors are not authorized under this DPA until added to this Annex and the Privacy Policy Subprocessor List, with notice given per Section 7.</p>
              </Section>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
