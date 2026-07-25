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
                This page is a placeholder pending an automated dependency license scan and must not be treated as a complete or final attribution list.
              </p>

              <Section title="1. Overview">
                <p>The Restops platform is built using open-source software components, each governed by its own license. This page is where required attribution notices and license summaries will be published.</p>
              </Section>

              <Section title="2. Attribution List Status">
                <p>[The full list of third-party packages and their licenses is not yet generated. Before production publication, run an automated license scan against the production dependency tree (for example, a `license-checker`-style report) and publish the resulting attribution list here, rather than a hand-maintained list, so it stays accurate as dependencies change.]</p>
              </Section>

              <Section title="3. Requesting License Texts">
                <p>Until the automated attribution list is published, the full text of any applicable open-source license can be requested at [LEGAL CONTACT EMAIL].</p>
              </Section>

              <Section title="4. No Warranty from Third-Party Licensors">
                <p>Open-source components are provided by their respective authors and licensors "as is," subject to the terms of their individual licenses, without warranty from Restops beyond what Restops separately commits to in its own Terms of Service.</p>
              </Section>

              <Section title="5. Contact">
                <p>Questions about open-source usage or attribution can be sent to [LEGAL CONTACT EMAIL].</p>
              </Section>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
