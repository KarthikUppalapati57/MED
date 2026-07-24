import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Activity } from "lucide-react";
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

export default function ServiceLevelAgreement() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="border-b bg-white px-6 h-16 flex items-center shrink-0 sticky top-0 z-10">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4 -ml-2 text-slate-500">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-slate-900">Restops Platform</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">Service Level Agreement</h1>
          <p className="text-sm text-slate-500 mb-8 pb-8 border-b border-slate-100">Last updated: {lastUpdated}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <Section title="1. Overview">
                <p>This Service Level Agreement ("SLA") describes Restops's availability and support commitments for the Restops platform (the "Platform") and forms part of the Terms of Service. It applies to paid Subscriptions in good standing and does not apply during a trial, or while an account is suspended for nonpayment or Acceptable Use Policy violations.</p>
              </Section>

              <Section title="2. Availability Commitment">
                <p>Restops targets 99.9% Platform availability, measured monthly, calculated as total minutes in the period minus Excluded Downtime, divided by total minutes in the period. "Excluded Downtime" includes Scheduled Maintenance (Section 4), Force Majeure events, and issues caused by Customer's equipment, third-party services not provided by Restops, or Customer's breach of the Terms of Service.</p>
              </Section>

              <Section title="3. Support">
                <p>Support is available 24x7 by email, telephone, and in-app chat. For critical issues, Restops targets an initial response within 10 minutes; this commitment is subject to confirmation of operational readiness before public launch. Severity definitions and response/resolution targets for non-critical issues are being finalized.</p>
              </Section>

              <Section title="4. Scheduled Maintenance">
                <p>Restops may perform scheduled maintenance that temporarily affects availability. Where reasonably possible, Restops will provide advance notice by email or in-app notification (notice period to be finalized). Scheduled Maintenance is excluded from the availability calculation in Section 2.</p>
              </Section>

              <Section title="5. Force Majeure">
                <p>Restops is not responsible for failing to meet this SLA to the extent caused by events beyond its reasonable control, including natural disasters, internet or utility failures, governmental action, or outages of third-party infrastructure or subprocessors Restops relies on to deliver the Platform.</p>
              </Section>

              <Section title="6. Service Credits">
                <p>The service credit schedule — the percentage of monthly fees credited at each availability shortfall tier, claim process, and claim deadline — is a pending business decision and will be published here before this SLA is presented as binding.</p>
              </Section>

              <Section title="7. How to Request a Credit">
                <p>Once the schedule in Section 6 is finalized, requests can be sent to [SUPPORT CONTACT EMAIL] within the claim window (to be finalized) of the incident, including the affected dates, times, and a description of the impact.</p>
              </Section>

              <Section title="8. Changes to This SLA">
                <p>We may update this SLA from time to time. Material changes will be communicated by email or in-app notification before they take effect.</p>
              </Section>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
