import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabaseClient';

export default function LandingPage() {
  const navigate = useNavigate();
  const [isDemoModalOpen, setIsDemoModalOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [demoForm, setDemoForm] = React.useState({
    fullName: '',
    email: '',
    companyName: '',
  });

  const handleDemoSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('demo_requests').insert({
        full_name: demoForm.fullName,
        email: demoForm.email,
        company_name: demoForm.companyName,
        status: 'new',
      });
      if (error) throw error;
      toast.success('Demo request received');
      setDemoForm({ fullName: '', email: '', companyName: '' });
      setIsDemoModalOpen(false);
    } catch (error) {
      toast.error(error.message || 'Failed to submit demo request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border bg-background/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-lg font-bold tracking-wide">Restops</Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate('/login')}>Log in</Button>
            <Button onClick={() => setIsDemoModalOpen(true)}>Book demo</Button>
          </div>
        </div>
      </nav>

      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Restaurant operations infrastructure
          </div>
          <div className="space-y-5">
            <h1 className="max-w-4xl text-5xl font-bold leading-tight tracking-normal sm:text-6xl">
              Control invoices, inventory, vendors, and labor from one operating layer.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Restops connects your back-office workflows to live operational data, so managers can approve, receive, reconcile, and act without spreadsheet drift.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={() => setIsDemoModalOpen(true)}>
              Request access
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/docs')}>View docs</Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="space-y-5">
            {[
              ['Invoice AP', 'Upload, validate, approve, schedule, and pay invoices.'],
              ['Inventory', 'Track receiving, counts, movements, wastage, and transfers.'],
              ['Performance', 'Connect sales, labor, and purchasing into operating metrics.'],
              ['Platform Admin', 'Manage organizations, modules, users, brands, and locations.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-md border border-border p-4">
                <h2 className="font-semibold">{title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Dialog open={isDemoModalOpen} onOpenChange={setIsDemoModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a demo</DialogTitle>
            <DialogDescription>Share where to reach you and we will follow up.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDemoSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" required value={demoForm.fullName} onChange={(event) => setDemoForm({ ...demoForm, fullName: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={demoForm.email} onChange={(event) => setDemoForm({ ...demoForm, email: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyName">Company</Label>
              <Input id="companyName" required value={demoForm.companyName} onChange={(event) => setDemoForm({ ...demoForm, companyName: event.target.value })} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Submit
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
