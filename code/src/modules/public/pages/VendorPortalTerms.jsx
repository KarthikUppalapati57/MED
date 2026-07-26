import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Handshake } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const effectiveDate = 'July 24, 2026';
const lastUpdated = 'July 24, 2026';

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-foreground uppercase tracking-wide">{title}</h2>
      <div className="space-y-2 text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

export default function VendorPortalTerms() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <nav className="border-b bg-card px-6 h-16 flex items-center shrink-0 sticky top-0 z-10">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4 -ml-2 text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Handshake className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-foreground">RestOps-360</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-foreground mb-2">Vendor Portal Terms</h1>
          <p className="text-sm text-muted-foreground mb-1">Effective date: {effectiveDate}</p>
          <p className="text-sm text-muted-foreground mb-8 pb-8 border-b border-border">Last updated: {lastUpdated}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <Section title="1. Scope">
                <p>These Vendor Portal Terms apply to a supplier or payee ("Vendor," "you") invited by a Restops customer organization ("Customer") to submit contact, tax, or banking information through the Restops vendor onboarding portal, typically via a one-time passcode (OTP) or secure link. They are separate from, and do not replace, the <a href="/terms" className="text-indigo-600 underline">Terms of Service</a> that govern the Customer's own account.</p>
              </Section>

              <Section title="2. Your Relationship to Restops">
                <p>Restops operates the vendor portal on behalf of the Customer that invited you. Restops is not your customer, does not decide what or when you are paid, and does not control the business relationship between you and the Customer. Restops's role is to provide a secure channel for submitting and storing the information the Customer's workflow requires.</p>
              </Section>

              <Section title="3. Information You Provide">
                <p>Depending on what the Customer's workflow requests, you may be asked for your legal business name, tax classification, tax identifier (EIN or SSN), W-9 details, banking routing/account numbers, and contact information. You are responsible for the accuracy of what you submit. Access to the portal is verified using a one-time passcode or a tokenized link that expires after a limited window.</p>
              </Section>

              <Section title="4. How Your Information Is Used">
                <p>Information you submit is used for vendor onboarding, tax reporting (including W-9/1099 recordkeeping), fraud and risk review, payment processing, payment-status communications, and bank account verification, including callback or manual-approval steps before a changed payout account is used.</p>
              </Section>

              <Section title="5. Manual Entry by Customer Staff">
                <p>If a Customer's staff member enters your tax or banking information on your behalf (for example, information you provided by phone or email), the platform requires that staff member to confirm you authorized the entry, and records that confirmation along with audit metadata. If you did not authorize an entry made on your behalf, contact the Customer directly and contact@mindfultechsol.com.</p>
              </Section>

              <Section title="6. Security">
                <p>Full tax identifiers and bank account/routing numbers are stored encrypted in a dedicated secrets vault; standard records and staff-facing screens show only the last four digits. See the <a href="/security" className="text-indigo-600 underline">Security Policy</a> for more detail.</p>
              </Section>

              <Section title="7. Bank Account Changes">
                <p>A request to change your payout bank account may require additional verification, such as a callback or manual approval, before the new account is used for payment. This is a fraud-prevention control and may add delay to a payout change.</p>
              </Section>

              <Section title="8. Retention">
                <p>Vendor tax, banking, and payment-authorization records follow the same retention lifecycle as other sensitive platform data: active use, then a 30-day archive, then permanent deletion, unless a longer period is required for legal, tax, or regulatory recordkeeping, in which case only the minimum necessary information is retained.</p>
              </Section>

              <Section title="9. Your Rights and Requests">
                <p>To ask what information a Customer has submitted about you, request a correction, or ask about deletion, contact the Customer directly or contact@mindfultechsol.com. Because the Customer controls the underlying vendor relationship, some requests may need to be handled through them.</p>
              </Section>

              <Section title="10. Changes">
                <p>We may update these Vendor Portal Terms from time to time. Material changes will be reflected here with an updated "Last updated" date.</p>
              </Section>

              <Section title="11. Contact">
                <p>Questions about the vendor portal can be sent to contact@mindfultechsol.com. Privacy-specific questions can be sent to contact@mindfultechsol.com.</p>
                <p className="pt-2">
                  <strong>Mindful Tech Solutions Inc., doing business as RestOps-360</strong><br />
                  224 S Peters Road, Knoxville, Tennessee 37923, United States<br />
                  Phone: +1 (865) 666-7690
                </p>
              </Section>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
