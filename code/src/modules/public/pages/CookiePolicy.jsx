import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Cookie } from "lucide-react";
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

export default function CookiePolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="border-b bg-white px-6 h-16 flex items-center shrink-0 sticky top-0 z-10">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4 -ml-2 text-slate-500">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Cookie className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-slate-900">Restops Platform</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">Cookie Policy</h1>
          <p className="text-sm text-slate-500 mb-8 pb-8 border-b border-slate-100">Last updated: {lastUpdated}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <Section title="1. Necessary Storage">
                <p>Restops uses strictly necessary browser storage and cookies to keep users signed in, maintain Supabase authentication sessions, remember local UI preferences, support MFA/session flows, and keep the web application functional.</p>
              </Section>

              <Section title="2. Analytics and Tracking">
                <p>PostHog and Sentry are disabled for production alignment and are not approved production subprocessors. This policy does not claim Plausible analytics or other third-party analytics tracking.</p>
              </Section>

              <Section title="3. Local Preferences">
                <p>The app may store non-sensitive local preferences such as theme, pending invite metadata, MFA setup skip state, offline/PWA state, and session workflow markers. These values support product functionality and should not be used for cross-site advertising.</p>
              </Section>

              <Section title="4. Managing Storage">
                <p>Blocking necessary storage may prevent login, MFA, tenant routing, offline support, or secure app workflows from functioning. Optional analytics consent controls are not active because production analytics are currently disabled.</p>
              </Section>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
