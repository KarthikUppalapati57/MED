import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield } from "lucide-react";
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

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="border-b bg-white px-6 h-16 flex items-center shrink-0 sticky top-0 z-10">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4 -ml-2 text-slate-500">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-slate-900">Restops Platform</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">Terms of Service</h1>
          <p className="text-sm text-slate-500 mb-8 pb-8 border-b border-slate-100">Last updated: {lastUpdated}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <Section title="1. Agreement and Accounts">
                <p>These Terms govern access to Restops, a multi-tenant restaurant operations platform for invoice capture, AP workflows, vendors, inventory, recipes, reporting, payments, integrations, and AI-assisted operational tools. You are responsible for authorized use within your tenant, organization, brand, and location scope.</p>
                <p>Electronic signatures, checkbox acceptances, and other electronic records may be used for binding platform agreements, payment authorizations, subscription terms, and customer consents.</p>
              </Section>

              <Section title="2. Subscriptions, Billing, and Trial">
                <p>Restops is billed monthly per active Location with AutoPay required. The launch promotion is a three-month trial for the first 100 customer Locations across the platform.</p>
                <p>Approved ACH authorization covers monthly subscription charges, approved recurring platform fees, late payment charges, returned payment fees, gateway processing fees where applicable, retries after failed transactions, and returned ACH item processing. ACH authorization may be revoked by written notice, but revocation does not remove outstanding obligations.</p>
                <p>Current business terms are no refunds, three months written cancellation notice, a two-calendar-day grace period, a 1% late charge per calendar day subject to legal review, suspension after 10 days of nonpayment, and termination after 30 days of nonpayment.</p>
              </Section>

              <Section title="3. Payments and Provider Terms">
                <p>Payment services may be processed through Stripe ACH Debit and Stripe Connect Custom. By using payment features, you agree to provide accurate account information and to accept any provider terms shown in the product, including ACH authorization, Stripe services terms, payout authorization, and provider-specific requirements.</p>
                <p>Future payment providers such as Checkbook, Dwolla, and Plaid are not active production subprocessors unless separately enabled and disclosed.</p>
              </Section>

              <Section title="4. Acceptable Use">
                <p>You may not misuse the platform, attempt to bypass tenant isolation, access data outside your authorization, interfere with security controls, upload malicious content, misuse API keys or webhooks, commit payment or vendor fraud, or enter vendor tax/banking information unless the vendor authorized you to do so.</p>
              </Section>

              <Section title="5. Data, AI, and Review">
                <p>You retain ownership of customer content submitted to the platform. Restops processes customer content to provide the service, support operations, maintain security, comply with legal obligations, and operate approved integrations.</p>
                <p>Production AI features are intended to use Azure OpenAI for invoice extraction, AI Assistant, and optional chatbot functionality. Customer information is not used to train public or shared AI models. AI-extracted invoice data must be reviewed and approved by an authorized human before becoming an operational record.</p>
              </Section>

              <Section title="6. Availability and Support">
                <p>The target availability commitment is 99.9%. Support targets are 24x7 by email, telephone, and in-app chat with a 10-minute target initial response for critical issues. These commitments remain subject to final operational readiness review before public launch.</p>
              </Section>

              <Section title="7. Legal Items Still To Be Finalized">
                <p>Final legal company name, business address, legal/privacy/security/support contacts, governing law, venue, arbitration, class action waiver, taxes, SLA credits, liability cap, and warranty language must be finalized before production publication.</p>
              </Section>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
