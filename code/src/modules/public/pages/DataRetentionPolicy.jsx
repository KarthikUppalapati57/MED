import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Archive } from "lucide-react";
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

export default function DataRetentionPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <nav className="border-b bg-card px-6 h-16 flex items-center shrink-0 sticky top-0 z-10">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4 -ml-2 text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Archive className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-foreground">RestOps-360</span>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12">
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8 md:p-12">
          <h1 className="text-3xl font-black tracking-tight text-foreground mb-2">Data Retention Policy</h1>
          <p className="text-sm text-muted-foreground mb-1">Effective date: {effectiveDate}</p>
          <p className="text-sm text-muted-foreground mb-8 pb-8 border-b border-border">Last updated: {lastUpdated}</p>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6">
              <Section title="1. General Lifecycle">
                <p>Sensitive information follows the hierarchy lifecycle unless longer retention is legally required: active hierarchy, 30-day archive after deletion begins, then permanent deletion.</p>
              </Section>

              <Section title="2. Sensitive Records">
                <p>Sensitive records include EIN/SSN, W-9s, banking information, ACH authorizations, electronic signatures, tax documents, vendor tax information, vendor banking details, payment events, and audit logs.</p>
              </Section>

              <Section title="3. Legal Exceptions">
                <p>Retention exceptions may apply for tax reporting, accounting and financial records, ACH/e-sign authorization proof, payment disputes, security incidents, fraud prevention, contract claims, litigation holds, and other legal obligations.</p>
              </Section>

              <Section title="4. Electronic Signatures">
                <p>Electronic signature records are retained for the duration required by applicable contractual, financial, tax, regulatory, and legal recordkeeping requirements.</p>
              </Section>

              <Section title="5. Deletion Records">
                <p>Deletion events should record scope, requester, authorization, deletion executor, archive period, permanent deletion timestamp, and retained exceptions. Final operational procedures are documented in the production readiness runbooks.</p>
              </Section>

              <Section title="6. Contact">
                <p>Questions about this Data Retention Policy can be sent to contact@mindfultechsol.com.</p>
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
