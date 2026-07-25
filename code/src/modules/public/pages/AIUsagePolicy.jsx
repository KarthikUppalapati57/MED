import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, BrainCircuit } from "lucide-react";
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

export default function AIUsagePolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="border-b bg-white px-6 h-16 flex items-center shrink-0 sticky top-0 z-10">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4 -ml-2 text-slate-500">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-slate-900">Restops Platform</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">AI Usage Policy</h1>
          <p className="text-sm text-slate-500 mb-8 pb-8 border-b border-slate-100">Last updated: {lastUpdated}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <Section title="1. Approved Provider">
                <p>Azure OpenAI is the approved production AI provider for Restops. The exact Azure deployment name and public model label must be verified against the production Azure resource before publication.</p>
              </Section>

              <Section title="2. AI Features">
                <p>AI features may include invoice extraction and normalization, AI Insights Copilot, AI Assistant, and optional chatbot capabilities where enabled. AI Assistant and chatbot classification as production or beta/experimental remains a product/legal decision before launch.</p>
              </Section>

              <Section title="3. Human Review">
                <p>AI-extracted invoice information requires review and approval by an authorized human before becoming operational record data. Users remain responsible for validating financial, tax, payment, and operational outputs before relying on them.</p>
              </Section>

              <Section title="4. Data Use">
                <p>Customer information is not used to train public or shared AI models. Data sent to approved AI services may include invoice extraction content, scoped operational context, and user prompts needed to provide the requested feature.</p>
              </Section>

              <Section title="5. Accuracy and Availability">
                <p>AI output may be incomplete or inaccurate. If AI Assistant or chatbot features are classified as beta or experimental, additional limitations, availability, and support disclaimers must be published before enablement.</p>
              </Section>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
