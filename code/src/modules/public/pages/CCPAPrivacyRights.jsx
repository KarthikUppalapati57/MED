import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Scale } from "lucide-react";
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

export default function CCPAPrivacyRights() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="border-b bg-white px-6 h-16 flex items-center shrink-0 sticky top-0 z-10">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4 -ml-2 text-slate-500">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-slate-900">Restops Platform</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">CCPA Notice at Collection &amp; Your California Privacy Choices</h1>
          <p className="text-sm text-slate-500 mb-8 pb-8 border-b border-slate-100">Last updated: {lastUpdated}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <Section title="1. Scope">
                <p>This notice supplements the <a href="/privacy" className="text-indigo-600 underline">Privacy Policy</a> and applies to California residents under the California Consumer Privacy Act, as amended by the California Privacy Rights Act (CCPA/CPRA).</p>
              </Section>

              <Section title="2. Notice at Collection">
                <p>At or before the point we collect personal information (for example, account signup or vendor onboarding), we collect the following categories, for the purposes described in the Privacy Policy: identifiers (name, email, phone), account and login information, commercial/business information (subscription and billing details), and, where applicable to your role, sensitive personal information (tax identifiers, W-9 details, bank account/routing numbers). Information is collected directly from you or from the organization that added you as a user or vendor. Retention follows the schedule in the Privacy Policy's Retention and Deletion section.</p>
              </Section>

              <Section title="3. We Do Not Sell or Share Personal Information">
                <p>Restops does not sell personal information for money, and does not "share" personal information for cross-context behavioral advertising as those terms are defined under the CCPA/CPRA. Because we do not engage in either activity, no "Do Not Sell or Share My Personal Information" opt-out link is required at this time; we will add one if that changes.</p>
              </Section>

              <Section title="4. Your California Rights">
                <p>Subject to verification and applicable exceptions, California residents may have the right to know/access the personal information we hold, request correction of inaccurate information, request deletion, and limit the use of sensitive personal information. We will not discriminate against you for exercising these rights.</p>
              </Section>

              <Section title="5. How to Submit a Request">
                <p>Submit a request to [PRIVACY CONTACT EMAIL]. We will need to verify your identity before acting on it. [Authorized-agent submission process to be finalized before production launch.]</p>
              </Section>

              <Section title="6. Changes to This Notice">
                <p>We may update this notice as our data practices or applicable law change. Material changes will be reflected here with an updated "Last updated" date.</p>
              </Section>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
