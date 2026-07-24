import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Ban } from "lucide-react";
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

export default function AcceptableUsePolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="border-b bg-white px-6 h-16 flex items-center shrink-0 sticky top-0 z-10">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4 -ml-2 text-slate-500">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Ban className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-slate-900">Restops Platform</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">Acceptable Use Policy</h1>
          <p className="text-sm text-slate-500 mb-8 pb-8 border-b border-slate-100">Last updated: {lastUpdated}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <Section title="1. Purpose">
                <p>This Acceptable Use Policy ("AUP") describes conduct that is prohibited when using the Restops platform (the "Platform") and is incorporated into the <a href="/terms" className="text-indigo-600 no-underline hover:underline">Terms of Service</a>. Violating this AUP may result in suspension or termination of your account.</p>
              </Section>

              <Section title="2. Prohibited Conduct">
                <p>You agree not to, and not to permit others to:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Upload or transmit viruses, malware, or other harmful or malicious code;</li>
                  <li>Attempt to breach tenant isolation, access data outside your organization's, brand's, or location's authorized scope, or circumvent role-based access controls or row-level security;</li>
                  <li>Reverse engineer, decompile, or attempt to extract the source code, algorithms, or AI/OCR models behind the Platform;</li>
                  <li>Probe or test the Platform's security, or bypass authentication or rate limits, without prior written authorization;</li>
                  <li>Submit false or unauthorized vendor tax or banking information, or falsely confirm vendor authorization when manually entering vendor data;</li>
                  <li>Attempt unauthorized ACH transactions, circumvent NACHA authorization/revocation requirements, or otherwise misuse payment features to commit fraud;</li>
                  <li>Change a vendor's payout bank account without required verification steps, or approve a payment known or suspected to be fraudulent;</li>
                  <li>Scrape or use automated means to extract data from the Platform, or make excessive API calls that degrade service for other tenants;</li>
                  <li>Share account credentials or allow access by anyone not authorized under your organization's account;</li>
                  <li>Use AI-assisted features to generate unlawful or harmful content, or to attempt to extract model internals or training data;</li>
                  <li>Upload content you do not have the right to upload, or that infringes a third party's rights;</li>
                  <li>Use the Platform in violation of applicable law, including data protection law and payment network rules.</li>
                </ul>
              </Section>

              <Section title="3. Monitoring and Enforcement">
                <p>We may investigate suspected violations of this AUP and may suspend or terminate access, remove content, or take other action reasonably necessary to protect the Platform, other tenants, or third parties, and may report conduct to law enforcement or relevant payment networks where required or appropriate.</p>
              </Section>

              <Section title="4. Reporting a Violation">
                <p>To report a suspected violation, contact [SECURITY CONTACT EMAIL] (security concerns) or [SUPPORT CONTACT EMAIL] (other concerns).</p>
              </Section>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
