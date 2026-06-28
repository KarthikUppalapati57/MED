import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="border-b bg-white px-6 h-16 flex items-center shrink-0 sticky top-0 z-10">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4 -ml-2 text-slate-500">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-slate-900">Restops Platform</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">Terms of Service</h1>
          <p className="text-sm text-slate-500 mb-8 pb-8 border-b border-slate-100">Last updated: {new Date().toLocaleDateString()}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <section>
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">1. Acceptance of Terms</h2>
                <p className="text-slate-600 leading-relaxed">
                  By accessing or using the Restops (Multi-tenant Enterprise Valuation & Stock-control) platform, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">2. Enterprise Licensing & Access</h2>
                <p className="text-slate-600 leading-relaxed">
                  Access to the Restops platform is provided on a subscription basis. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your organization's tenant workspace.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">3. Acceptable Use Policy</h2>
                <p className="text-slate-600 leading-relaxed">
                  You agree not to use the platform to: (a) upload harmful or malicious code; (b) attempt to breach tenant isolation or access unauthorized data; (c) reverse engineer the platform's proprietary OCR or AI models.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">4. Data Ownership & Retention</h2>
                <p className="text-slate-600 leading-relaxed">
                  You retain all rights to the data (invoices, inventory logs, user records) uploaded to the platform. Upon subscription termination or upon explicit request via your User Profile, Restops will permanently delete your organizational data in compliance with data privacy regulations.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">5. Limitation of Liability</h2>
                <p className="text-slate-600 leading-relaxed">
                  Restops provides inventory intelligence and automated OCR extraction. We do not guarantee 100% accuracy of extracted text. Users are responsible for validating financial data before finalizing ledger entries. In no event shall Restops be liable for indirect or consequential damages.
                </p>
              </section>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
