import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Lock } from "lucide-react";
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
          <p className="text-sm text-slate-500 mb-8 pb-8 border-b border-slate-100">Last updated: {lastUpdated}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <Section title="1. Information We Collect">
                <p>We collect account data such as name, email, phone, user ID, role, organization, brand, location, login/session metadata, MFA status, invitation records, notification preferences, and audit actor IDs.</p>
                <p>We collect business data including organizations, locations, vendors, supplier contacts, invoices, invoice line items, approvals, payment/accounting records, products, inventory, recipes, labor, reporting data, POS/delivery integrations, webhooks, API keys, and operational logs.</p>
                <p>Sensitive data may include EIN/SSN, W-9 documents, vendor tax details, bank account/routing details, ACH authorizations, electronic signatures, IP address, user agent, tax documents, and payment-provider references. Full bank and tax values are stored through encrypted vault patterns where implemented; normal app tables should store limited references such as last four digits and status metadata.</p>
              </Section>

              <Section title="2. How We Use Information">
                <p>We use information to provide the platform, authenticate users, enforce tenant boundaries, process invoices, manage vendors and payments, maintain accounting and operational records, send transactional notices, support customers, prevent fraud, audit sensitive access, and comply with contractual, financial, tax, regulatory, and legal obligations.</p>
                <p>Transactional communications use email and in-app notifications at launch. SMS, telephone automation, and automated voice are future channels and require separate lawful consent before enablement.</p>
              </Section>

              <Section title="3. AI and Customer Data">
                <p>Approved production AI processing is Azure OpenAI for invoice extraction, AI Assistant, and optional chatbot features. Customer information is not used to train public or shared AI models. AI-extracted invoice information requires human review and approval before becoming operational record data.</p>
              </Section>

              <Section title="4. Subprocessors">
                <p>Current approved production technologies are Supabase, Vercel, Azure OpenAI, Stripe ACH Debit, Stripe Connect Custom, and Resend. Production regions for these providers must be finalized before public launch.</p>
                <p>Google Gemini, PostHog, Sentry, and EmailJS are not approved production subprocessors. Checkbook, Dwolla, Plaid, and Google Cloud Run are planned or future technologies unless separately enabled and disclosed.</p>
              </Section>

              <Section title="5. Retention and Deletion">
                <p>Sensitive information follows the hierarchy lifecycle unless longer retention is legally required: active hierarchy, 30-day archive, then permanent deletion. If longer retention is legally required, only the minimum required information should be retained.</p>
                <p>Electronic signature records are retained for the duration required by applicable contractual, financial, tax, regulatory, and legal recordkeeping requirements.</p>
              </Section>

              <Section title="6. Rights and Requests">
                <p>Users may export currently implemented profile-related data and submit account deletion requests from the profile privacy controls. Full DSAR intake method, identity verification, response timelines, deletion exceptions, organization-admin authority, portability format, and consent withdrawal handling must be finalized before production launch.</p>
              </Section>

              <Section title="7. Security">
                <p>Security controls include Supabase Auth, optional MFA, 15-character high-complexity passwords, 30-minute inactivity timeout, RBAC, RLS, tenant scoping, private storage patterns, audit logs, and encrypted vault storage for supported sensitive records. Backup, restore, incident response, vulnerability management, and provider-region statements must be finalized before public launch.</p>
              </Section>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
