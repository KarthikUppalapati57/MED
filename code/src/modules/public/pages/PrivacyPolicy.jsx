import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Lock } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="border-b bg-white px-6 h-16 flex items-center shrink-0 sticky top-0 z-10">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4 -ml-2 text-slate-500">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-slate-900">Restops Platform</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-slate-500 mb-8 pb-8 border-b border-slate-100">Last updated: {new Date().toLocaleDateString()}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <section>
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">1. Information We Collect</h2>
                <p className="text-slate-600 leading-relaxed">
                  We collect information you provide directly to us, including: names, email addresses, payment information (processed securely via Stripe), and enterprise data uploaded to your secure tenant environment (e.g., invoices, supply catalogs).
                </p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">2. How We Use Your Information</h2>
                <p className="text-slate-600 leading-relaxed">
                  We use your data solely to provide, maintain, and improve the Restops platform. We do not sell your personal or enterprise data to third parties. Uploaded financial documents are processed securely and isolated per organization.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">3. California Privacy Rights (CCPA)</h2>
                <p className="text-slate-600 leading-relaxed">
                  If you are a California resident, you have the right to request access to the personal information we collect about you, request deletion of your information, and opt out of the sale of your personal information (note: we do not sell your data). You may exercise these rights directly from your User Profile dashboard.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">4. Data Security</h2>
                <p className="text-slate-600 leading-relaxed">
                  We implement enterprise-grade security measures including Row-Level Security (RLS) in our databases, encrypted storage buckets, and secure edge networks to protect your data from unauthorized access.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">5. Your Data Rights & Export</h2>
                <p className="text-slate-600 leading-relaxed">
                  You maintain full ownership of your data. You may download a CSV export of your account history at any time or request permanent account deletion through the platform settings.
                </p>
              </section>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
