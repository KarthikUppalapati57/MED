import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles } from "lucide-react";
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

export default function AIFeaturesAddendum() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <nav className="border-b bg-card px-6 h-16 flex items-center shrink-0 sticky top-0 z-10">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4 -ml-2 text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-foreground">RestOps-360</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-foreground mb-2">AI Features Addendum</h1>
          <p className="text-sm text-muted-foreground mb-1">Effective date: {effectiveDate}</p>
          <p className="text-sm text-muted-foreground mb-8 pb-8 border-b border-border">Last updated: {lastUpdated}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <Section title="1. Scope">
                <p>This addendum supplements the <a href="/terms" className="text-indigo-600 underline">Terms of Service</a> and applies specifically to Restops's AI-assisted features: invoice data extraction, the AI Assistant, and the optional chatbot, powered by Azure OpenAI. If this addendum conflicts with the Terms of Service on an AI-specific point, this addendum controls.</p>
              </Section>

              <Section title="2. Beta and Experimental Features">
                <p>The chatbot and certain AI Assistant capabilities may be labeled beta or experimental. Beta features are offered without the reliability, support, or availability commitments that apply to core Platform features, may change materially, and may be discontinued at any time.</p>
              </Section>

              <Section title="3. Human Review Is Required">
                <p>AI-extracted invoice data and AI-generated suggestions are a starting point, not a verified record. They require review and approval by an authorized user before they become an operational record (for example, before being relied on for payment or accounting purposes). Do not treat AI output as final without that review.</p>
              </Section>

              <Section title="4. No Training on Your Data">
                <p>Your Customer Content is not used to train public or shared AI models.</p>
              </Section>

              <Section title="5. Accuracy Disclaimer">
                <p>AI and OCR output can be incomplete or incorrect. Restops does not guarantee the accuracy of extracted or AI-generated content, and you are responsible for validating it before relying on it, particularly for financial, tax, or compliance decisions.</p>
              </Section>

              <Section title="6. Data Sent to the AI Provider">
                <p>To generate extraction results or assistant/chatbot responses, relevant invoice text and operational context may be sent to Azure OpenAI. See the <a href="/privacy" className="text-indigo-600 underline">Privacy Policy</a> for how Azure OpenAI is used as a subprocessor.</p>
              </Section>

              <Section title="7. Appropriate Use">
                <p>AI features are subject to the <a href="/acceptable-use" className="text-indigo-600 underline">Acceptable Use Policy</a>, including the prohibition on using AI features to generate unlawful or harmful content or to attempt to extract model internals, training data, or system prompts.</p>
              </Section>

              <Section title="8. Changes to AI Features">
                <p>We may add, change, or remove AI features, including moving a feature in or out of beta, as the Platform evolves. Material changes will be communicated by email or in-app notification.</p>
              </Section>

              <Section title="9. Contact">
                <p>Questions about AI features can be sent to contact@mindfultechsol.com.</p>
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
