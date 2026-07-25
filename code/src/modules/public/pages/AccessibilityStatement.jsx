import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Accessibility } from "lucide-react";
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

export default function AccessibilityStatement() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="border-b bg-white px-6 h-16 flex items-center shrink-0 sticky top-0 z-10">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4 -ml-2 text-slate-500">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Accessibility className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-slate-900">Restops Platform</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">Accessibility Statement</h1>
          <p className="text-sm text-slate-500 mb-8 pb-8 border-b border-slate-100">Last updated: {lastUpdated}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <Section title="1. Our Commitment">
                <p>Restops aims to make the platform usable by the widest practical range of people, including people with disabilities. Accessibility is an ongoing effort rather than a one-time project.</p>
              </Section>

              <Section title="2. Standards We Target">
                <p>We use the Web Content Accessibility Guidelines (WCAG) 2.1, Level AA, as our working guideline. We have not yet completed a formal third-party accessibility audit or certification, and do not claim full conformance at this time.</p>
              </Section>

              <Section title="3. Measures Taken">
                <p>The Platform's interface is built on accessibility-focused component primitives (Radix UI) that provide keyboard navigation, focus management, and screen-reader semantics out of the box, and we follow semantic HTML and color-contrast practices in our own design system on top of them.</p>
              </Section>

              <Section title="4. Known Limitations">
                <p>[A full accessibility audit has not yet been performed; specific known issues and their remediation timeline will be listed here once that audit is complete.]</p>
              </Section>

              <Section title="5. Feedback">
                <p>If you encounter an accessibility barrier using the Platform, tell us the page and what happened at [SUPPORT CONTACT EMAIL]. We will work to address reported issues.</p>
              </Section>

              <Section title="6. Ongoing Efforts">
                <p>A formal accessibility audit is on our roadmap. This statement will be updated as that work is completed.</p>
              </Section>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
