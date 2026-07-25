import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Code2 } from "lucide-react";
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

export default function OpenSourceNotices() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="border-b bg-white px-6 h-16 flex items-center shrink-0 sticky top-0 z-10">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4 -ml-2 text-slate-500">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Code2 className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-slate-900">Restops Platform</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">Open Source &amp; Third-Party Notices</h1>
          <p className="text-sm text-slate-500 mb-8 pb-8 border-b border-slate-100">Last updated: {lastUpdated}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <p className="text-slate-500 text-xs italic border-l-2 border-amber-300 pl-3">
                Generated from an automated scan (<code>license-checker</code>) on July 25, 2026 against production dependencies only. Counts change as dependencies change — regenerate before each production release rather than editing this list by hand.
              </p>

              <Section title="1. Overview">
                <p>The Restops platform is built using open-source software components, each governed by its own license. This page summarizes the scan results; the full package-by-package list is maintained in the repository at <code>docs/legal/third_party_notices.md</code> and is available on request.</p>
              </Section>

              <Section title="2. License Summary">
                <p>534 production packages (including transitive dependencies) were scanned, covering 11 distinct license identifiers:</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50 text-slate-700">
                        <th className="text-left p-2 border border-slate-200">License</th>
                        <th className="text-left p-2 border border-slate-200">Package Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td className="p-2 border border-slate-200">MIT</td><td className="p-2 border border-slate-200">473</td></tr>
                      <tr><td className="p-2 border border-slate-200">ISC</td><td className="p-2 border border-slate-200">27</td></tr>
                      <tr><td className="p-2 border border-slate-200">Apache-2.0</td><td className="p-2 border border-slate-200">17</td></tr>
                      <tr><td className="p-2 border border-slate-200">BSD-3-Clause</td><td className="p-2 border border-slate-200">7</td></tr>
                      <tr><td className="p-2 border border-slate-200">Hippocratic-2.1</td><td className="p-2 border border-slate-200">2</td></tr>
                      <tr><td className="p-2 border border-slate-200">BSD-2-Clause</td><td className="p-2 border border-slate-200">2</td></tr>
                      <tr><td className="p-2 border border-slate-200">MIT (inferred)</td><td className="p-2 border border-slate-200">2</td></tr>
                      <tr><td className="p-2 border border-slate-200">MPL-2.0 OR Apache-2.0 (dual)</td><td className="p-2 border border-slate-200">1</td></tr>
                      <tr><td className="p-2 border border-slate-200">MIT AND Zlib</td><td className="p-2 border border-slate-200">1</td></tr>
                      <tr><td className="p-2 border border-slate-200">0BSD</td><td className="p-2 border border-slate-200">1</td></tr>
                      <tr><td className="p-2 border border-slate-200">MIT AND ISC</td><td className="p-2 border border-slate-200">1</td></tr>
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section title="3. Flagged for Legal Review">
                <p><strong>react-leaflet</strong> and <strong>@react-leaflet/core</strong> (used for map/location features) are licensed under <strong>Hippocratic-2.1</strong>, an "ethical source" license, not a standard OSI-approved open-source license. It grants use rights subject to conditions tied to human-rights-related conduct standards, which is a materially different risk profile than the MIT/Apache/BSD licenses covering the rest of the dependency tree. [This needs an actual legal review before production publication — has not been assessed here beyond flagging it.] The remaining non-standard entries (a dual-licensed MPL-2.0/Apache-2.0 package, two license-inferred "MIT*" packages, and a couple of compound permissive licenses) are low-risk and typical for a JavaScript dependency tree.</p>
              </Section>

              <Section title="4. Requesting License Texts">
                <p>The full text of any applicable open-source license can be requested at [LEGAL CONTACT EMAIL].</p>
              </Section>

              <Section title="5. No Warranty from Third-Party Licensors">
                <p>Open-source components are provided by their respective authors and licensors "as is," subject to the terms of their individual licenses, without warranty from Restops beyond what Restops separately commits to in its own Terms of Service.</p>
              </Section>

              <Section title="6. Contact">
                <p>Questions about open-source usage or attribution can be sent to [LEGAL CONTACT EMAIL].</p>
              </Section>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
