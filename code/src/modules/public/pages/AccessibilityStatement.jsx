import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Accessibility } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const effectiveDate = 'July 24, 2026';
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
          <span className="font-bold text-slate-900">RestOps-360</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">Accessibility Statement</h1>
          <p className="text-sm text-slate-500 mb-1">Effective date: {effectiveDate}</p>
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
                <p>On July 25, 2026, we ran an automated scan (axe-core via Playwright, WCAG 2.0/2.1 A &amp; AA rules) against the sign-in, sign-up, and all 13 legal/policy pages, and fixed what it found: scrollable content regions were not reachable by keyboard (fixed by making the scroll viewport focusable), and cross-reference links inside body text relied on color alone to be distinguishable, with insufficient contrast against surrounding text (fixed by underlining links by default instead of only on hover). All 16 scanned routes now pass with zero critical or serious violations.</p>
              </Section>

              <Section title="4. Known Limitations">
                <p>The July 25, 2026 scan covered only public/unauthenticated routes (sign-in, sign-up, legal pages) using automated tooling, which catches a meaningful subset of accessibility issues but not all of them — manual keyboard-only and screen-reader testing has not been performed, and the authenticated application (dashboards, forms, data tables across ~20+ modules) has not been scanned at all. A full manual audit and authenticated-route coverage remain on the roadmap; this section will be updated as that work is completed.</p>
              </Section>

              <Section title="5. Feedback">
                <p>If you encounter an accessibility barrier using the Platform, tell us the page and what happened at contact@mindfultechsol.com. We will work to address reported issues.</p>
                <p className="pt-2">
                  <strong>Mindful Tech Solutions Inc., doing business as RestOps-360</strong><br />
                  224 S Peters Road, Knoxville, Tennessee 37923, United States<br />
                  Phone: +1 (865) 666-7690
                </p>
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
