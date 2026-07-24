import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck } from "lucide-react";
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

export default function SecurityPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="border-b bg-white px-6 h-16 flex items-center shrink-0 sticky top-0 z-10">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4 -ml-2 text-slate-500">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-slate-900">Restops Platform</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">Security Policy</h1>
          <p className="text-sm text-slate-500 mb-8 pb-8 border-b border-slate-100">Last updated: {lastUpdated}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <Section title="1. Overview">
                <p>This Security Policy summarizes the technical and organizational measures Restops uses to protect customer content on the Restops platform (the "Platform"). Items still pending production verification are noted as such rather than asserted as complete.</p>
              </Section>

              <Section title="2. Access Control">
                <p>Access is governed by role-based access control combined with database-level row security, scoped to your organization, brand, and location hierarchy, enforced at the database layer, not only in the application. Financial workflow changes such as invoice approval are enforced server-side. Account controls include a minimum 15-character, high-complexity password policy, optional multi-factor authentication (TOTP), and a 30-minute inactivity session timeout.</p>
              </Section>

              <Section title="3. Sensitive Data Protection">
                <p>Full tax identifiers (EIN/SSN), W-9 details, and bank routing/account numbers are stored encrypted in a dedicated secrets vault separate from standard application tables. Standard tables and staff-facing screens display only the last four digits. Decryption is limited to narrow, service-role-only backend paths, and reveal/decrypt events are logged. There is no admin-facing "reveal full tax ID" path.</p>
              </Section>

              <Section title="4. Encryption">
                <p>Data in transit is encrypted using TLS. Data at rest relies on the storage and database encryption provided by our infrastructure providers (Supabase and Azure). Provider-specific encryption-at-rest statements will be confirmed and cited here before production launch.</p>
              </Section>

              <Section title="5. Audit Logging and Monitoring">
                <p>Security-relevant actions are recorded in audit logs, including invoice/payment approval events, vendor tax and banking data access, and administrative changes, supporting internal review, customer support, and incident investigation.</p>
              </Section>

              <Section title="6. Vendor and Subprocessor Security">
                <p>We rely on established infrastructure and payment providers, including Supabase, Vercel, Azure OpenAI, Stripe, and Resend, that maintain their own security programs. We evaluate subprocessors before onboarding and require contractual security and confidentiality commitments. See the <a href="/privacy" className="text-indigo-600 no-underline hover:underline">Privacy Policy</a> for the current subprocessor list.</p>
              </Section>

              <Section title="7. Incident Response">
                <p>We maintain a process to detect, investigate, and respond to security incidents. If we confirm a security incident affecting your data, we will provide notice without undue delay, consistent with applicable law. Detailed severity definitions, escalation matrix, and RPO/RTO targets are being finalized for the production launch checklist.</p>
              </Section>

              <Section title="8. Vulnerability Management and Responsible Disclosure">
                <p>We track and remediate vulnerabilities in our own code and monitor advisories for third-party dependencies and subprocessors. To report a suspected vulnerability, contact [SECURITY CONTACT EMAIL] rather than testing it against live customer data; please allow reasonable time to investigate before public disclosure.</p>
              </Section>

              <Section title="9. Business Continuity">
                <p>We maintain backup and point-in-time recovery capability for production data. Backup frequency, retention, and restore-drill schedule are being finalized for the production launch checklist.</p>
              </Section>

              <Section title="10. Compliance Roadmap">
                <p>We are working toward alignment with common industry frameworks, including SOC 2, as part of our compliance roadmap, and do not claim any certification until formally achieved and verified.</p>
              </Section>

              <Section title="11. Contact">
                <p>Security questions or reports can be sent to [SECURITY CONTACT EMAIL].</p>
              </Section>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
