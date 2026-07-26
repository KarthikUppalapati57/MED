import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileSignature } from "lucide-react";
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

export default function MasterSubscriptionAgreement() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <nav className="border-b bg-card px-6 h-16 flex items-center shrink-0 sticky top-0 z-10">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4 -ml-2 text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <FileSignature className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-foreground">RestOps-360</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-foreground mb-2">Master Subscription Agreement</h1>
          <p className="text-sm text-muted-foreground mb-1">Effective date: {effectiveDate}</p>
          <p className="text-sm text-muted-foreground mb-8 pb-8 border-b border-border">Last updated: {lastUpdated}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <p className="text-muted-foreground text-xs italic border-l-2 border-amber-300 pl-3">
                This is a negotiated-deal template, not a click-through page. It only governs a Customer that has executed an Order Form referencing it; every other Customer is governed by the standard <a href="/terms" className="text-indigo-600 underline">Terms of Service</a>.
              </p>

              <Section title="1. Structure">
                <p>This Master Subscription Agreement ("MSA") governs a Customer's use of the Restops platform when the Customer and Mindful Tech Solutions Inc., doing business as RestOps-360 ("Restops") have executed an Order Form that references this MSA. It does not apply to Customers who sign up through the standard self-serve flow; those Customers are governed by the Terms of Service.</p>
              </Section>

              <Section title="2. Order Forms">
                <p>Each Order Form specifies the subscription tier, number of Locations, fees, billing frequency, initial term, and any deal-specific terms, and incorporates this MSA by reference. See Exhibit A for the standard Order Form fields.</p>
              </Section>

              <Section title="3. Order of Precedence">
                <p>If there is a conflict, the applicable Order Form controls over this MSA, and this MSA controls over the public Terms of Service, Acceptable Use Policy, Privacy Policy, and Security Policy, each of which is incorporated by reference for anything this MSA does not separately address.</p>
              </Section>

              <Section title="4. License Grant">
                <p>Subject to this MSA and the applicable Order Form, Restops grants Customer a non-exclusive, non-transferable right to access and use the Platform during the subscription term, for Customer's internal business operations.</p>
              </Section>

              <Section title="5. Fees and Payment">
                <p>Fees are as stated in the Order Form. Except as stated in the Order Form, payment terms, AutoPay/ACH authorization, late fees, and suspension/termination for nonpayment follow the Terms of Service.</p>
              </Section>

              <Section title="6. Term and Renewal">
                <p>The subscription term is stated in the Order Form and renews automatically for successive terms of the same length unless either party gives notice of non-renewal at least [RENEWAL NOTICE PERIOD TBD] before the end of the then-current term.</p>
              </Section>

              <Section title="7. Termination">
                <p>Either party may terminate for the other's uncured material breach on written notice and a 30-day cure period. Termination for nonpayment follows the Terms of Service. Any deal-specific termination rights (for example, termination for convenience) must be stated in the Order Form to apply.</p>
              </Section>

              <Section title="8. Confidentiality, IP, Warranty, Liability, and Indemnity">
                <p>The confidentiality, intellectual property, warranty disclaimer, limitation of liability, and indemnification terms of the Terms of Service apply to this MSA, except to the extent the Order Form expressly states different terms (for example, a negotiated liability cap).</p>
              </Section>

              <Section title="9. Governing Law">
                <p>This MSA is governed by the laws of Tennessee, with venue in Knox County, Tennessee, consistent with the Terms of Service.</p>
              </Section>

              <Section title="10. Signatures">
                <p>[Signature block placeholder — Customer legal entity name, signatory name and title, date; Restops signatory name and title, date.]</p>
              </Section>

              <Section title="Exhibit A — Order Form Fields">
                <ul className="list-disc list-inside space-y-1">
                  <li>Customer legal entity name and billing address</li>
                  <li>Subscription tier and included modules</li>
                  <li>Number of Locations at signing, and process for adding Locations</li>
                  <li>Fees, billing frequency, and payment method</li>
                  <li>Initial term and renewal terms (if different from Section 6)</li>
                  <li>Any negotiated deviations from the MSA (liability cap, SLA credits, termination rights)</li>
                  <li>Effective date and signature block</li>
                </ul>
              </Section>

              <Section title="11. Contact">
                <p>Questions about this Master Subscription Agreement template, outside of a specific Order Form, can be sent to contact@mindfultechsol.com.</p>
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
