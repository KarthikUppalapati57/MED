import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Code2 } from "lucide-react";
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

export default function OpenSourceNotices() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <nav className="border-b bg-card px-6 h-16 flex items-center shrink-0 sticky top-0 z-10">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4 -ml-2 text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Code2 className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-foreground">RestOps-360</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-foreground mb-2">Open Source &amp; Third-Party Notices</h1>
          <p className="text-sm text-muted-foreground mb-1">Effective date: {effectiveDate}</p>
          <p className="text-sm text-muted-foreground mb-8 pb-8 border-b border-border">Last updated: {lastUpdated}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <p className="text-muted-foreground text-xs italic border-l-2 border-amber-300 pl-3">
                Generated from an automated scan (<code>license-checker</code>) on July 25, 2026 against production dependencies only. Counts change as dependencies change — regenerate before each production release rather than editing this list by hand.
              </p>

              <Section title="1. Overview">
                <p>The Restops platform is built using open-source software components, each governed by its own license. This page summarizes the scan results; the full package-by-package list is maintained in the repository at <code>docs/legal/third_party_notices.md</code> and is available on request.</p>
              </Section>

              <Section title="2. License Summary">
                <p>534 production packages (including transitive dependencies) were scanned, covering 11 distinct license identifiers:</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border border-border">
                    <thead>
                      <tr className="bg-muted/40 text-muted-foreground">
                        <th className="text-left p-2 border border-border">License</th>
                        <th className="text-left p-2 border border-border">Package Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td className="p-2 border border-border">MIT</td><td className="p-2 border border-border">473</td></tr>
                      <tr><td className="p-2 border border-border">ISC</td><td className="p-2 border border-border">27</td></tr>
                      <tr><td className="p-2 border border-border">Apache-2.0</td><td className="p-2 border border-border">17</td></tr>
                      <tr><td className="p-2 border border-border">BSD-3-Clause</td><td className="p-2 border border-border">7</td></tr>
                      <tr><td className="p-2 border border-border">Hippocratic-2.1</td><td className="p-2 border border-border">2</td></tr>
                      <tr><td className="p-2 border border-border">BSD-2-Clause</td><td className="p-2 border border-border">2</td></tr>
                      <tr><td className="p-2 border border-border">MIT (inferred)</td><td className="p-2 border border-border">2</td></tr>
                      <tr><td className="p-2 border border-border">MPL-2.0 OR Apache-2.0 (dual)</td><td className="p-2 border border-border">1</td></tr>
                      <tr><td className="p-2 border border-border">MIT AND Zlib</td><td className="p-2 border border-border">1</td></tr>
                      <tr><td className="p-2 border border-border">0BSD</td><td className="p-2 border border-border">1</td></tr>
                      <tr><td className="p-2 border border-border">MIT AND ISC</td><td className="p-2 border border-border">1</td></tr>
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section title="3. Flagged for Legal Review">
                <p><strong>react-leaflet</strong> and <strong>@react-leaflet/core</strong> (used for map/location features) are licensed under <strong>Hippocratic-2.1</strong>, an "ethical source" license, not a standard OSI-approved open-source license. It grants use rights subject to conditions tied to human-rights-related conduct standards, which is a materially different risk profile than the MIT/Apache/BSD licenses covering the rest of the dependency tree. [This needs an actual legal review before production publication — has not been assessed here beyond flagging it.] The remaining non-standard entries (a dual-licensed MPL-2.0/Apache-2.0 package, two license-inferred "MIT*" packages, and a couple of compound permissive licenses) are low-risk and typical for a JavaScript dependency tree.</p>
              </Section>

              <Section title="4. Requesting License Texts">
                <p>The full text of any applicable open-source license can be requested at contact@mindfultechsol.com.</p>
              </Section>

              <Section title="5. No Warranty from Third-Party Licensors">
                <p>Open-source components are provided by their respective authors and licensors "as is," subject to the terms of their individual licenses, without warranty from Restops beyond what Restops separately commits to in its own Terms of Service.</p>
              </Section>

              <Section title="6. Contact">
                <p>Questions about open-source usage or attribution can be sent to contact@mindfultechsol.com.</p>
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
