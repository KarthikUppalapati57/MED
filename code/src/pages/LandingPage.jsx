import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import dashboardImg from '../assets/dashboard.png';
import scannerImg from '../assets/scanner.png';
import { 
  ArrowRight, 
  Menu, 
  X, 
  ShieldCheck, 
  Zap, 
  BarChart3, 
  Layers,
  CheckCircle2,
  Clock,
  Sparkles,
  Loader2,
  ChevronRight,
  Database
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function LandingPage() {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [demoForm, setDemoForm] = React.useState({
    fullName: '',
    email: '',
    companyName: '',
    phone: '',
    plan: 'platform_unlimited'
  });

  const handleDemoSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('demo_requests')
        .insert([{
          full_name: demoForm.fullName,
          email: demoForm.email,
          company_name: demoForm.companyName,
          phone: demoForm.phone,
          plan: demoForm.plan,
          status: 'new'
        }]);

      if (error) throw error;

      toast.success("Demo request submitted! Our team will contact you soon.");
      setIsDemoModalOpen(false);
      setDemoForm({ fullName: '', email: '', companyName: '', phone: '', plan: 'platform_unlimited' });
    } catch (err) {
      toast.error(err.message || "Failed to submit request");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 selection:bg-brand-teal/30 font-sans antialiased">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#15181e]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-sm bg-[#14c6cb] flex items-center justify-center">
                <Database className="h-4 w-4 text-[#15181e]" />
              </div>
              <span className="text-lg font-bold tracking-tighter text-white">
                EDGEOPS
              </span>
            </div>
            
            <div className="hidden md:flex items-center gap-8 text-[13px] font-medium tracking-wider text-slate-400 uppercase">
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#showcase" className="hover:text-white transition-colors">Docs</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
              <div className="h-4 w-[1px] bg-white/10 mx-2" />
              <button 
                className="hover:text-white transition-colors"
                onClick={() => navigate('/login')}
              >
                Log in
              </button>
              <Button 
                className="bg-[#14c6cb] text-[#15181e] hover:bg-[#12adb1] font-bold text-[12px] h-8 px-4 rounded-sm transition-all"
                onClick={() => setIsDemoModalOpen(true)}
              >
                BOOK DEMO
              </Button>
            </div>

            <div className="md:hidden">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-slate-400">
                {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-[#15181e] border-b border-white/5 p-4 space-y-4">
            <a href="#features" className="block text-slate-400 hover:text-white text-sm uppercase tracking-widest">Features</a>
            <a href="#showcase" className="block text-slate-400 hover:text-white text-sm uppercase tracking-widest">Docs</a>
            <a href="#pricing" className="block text-slate-400 hover:text-white text-sm uppercase tracking-widest">Pricing</a>
            <hr className="border-white/5" />
            <Button variant="ghost" className="w-full justify-start text-slate-400 px-0 h-auto" onClick={() => navigate('/login')}>Log in</Button>
            <Button className="w-full bg-[#14c6cb] text-[#15181e] hover:bg-[#12adb1] rounded-sm" onClick={() => navigate('/login?mode=signup')}>Get Started</Button>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 bg-[#15181e] overflow-hidden text-white">
        {/* Technical Grid Pattern Overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(#14c6cb 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-sm bg-[#14c6cb]/10 border border-[#14c6cb]/20 text-[10px] font-bold tracking-[2px] uppercase text-[#14c6cb] mb-8">
              <Sparkles className="h-3 w-3" />
              Operational Automation System
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8 text-white leading-[0.95]">
              Infrastructure <br /> for your kitchen.
            </h1>
            
            <p className="max-w-xl text-lg text-slate-400 mb-10 leading-relaxed font-medium">
              Automated invoice extraction, real-time inventory synchronization, and AI-driven ordering lifecycle management. Built for the modern hospitality enterprise.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Button size="lg" className="h-11 px-8 bg-[#14c6cb] text-[#15181e] hover:bg-[#12adb1] font-bold text-sm tracking-widest rounded-sm transition-all" onClick={() => setIsDemoModalOpen(true)}>
                REQUEST DEMO <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="h-11 px-8 border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold text-sm tracking-widest rounded-sm" onClick={() => document.getElementById('features').scrollIntoView({behavior: 'smooth'})}>
                VIEW DOCS
              </Button>
            </div>
          </div>

          {/* Interactive Interface Preview with Frame */}
          <div className="mt-20 relative group">
            <div className="absolute -inset-1 bg-[#14c6cb]/20 rounded-lg blur-2xl opacity-20 pointer-events-none" />
            <div className="relative rounded-sm border border-white/10 overflow-hidden bg-[#1a1d24] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)]">
              <div className="h-8 border-b border-white/5 bg-[#15181e] flex items-center px-4 gap-1.5 leading-none">
                <div className="w-2 h-2 rounded-full bg-white/10" />
                <div className="w-2 h-2 rounded-full bg-white/10" />
                <div className="w-2 h-2 rounded-full bg-white/10" />
                <div className="ml-4 h-3 w-32 bg-white/5 rounded-full" />
              </div>
              <img src={dashboardImg} alt="Dashboard Preview" className="w-full object-cover filter brightness-95" />
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="py-6 border-y border-slate-100 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="flex flex-col items-center md:items-start">
              <div className="text-xl font-bold tracking-tighter">99.8%</div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Extraction Accuracy</div>
            </div>
            <div className="flex flex-col items-center md:items-start">
              <div className="text-xl font-bold tracking-tighter">1.4ms</div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Sync Latency</div>
            </div>
            <div className="flex flex-col items-center md:items-start">
              <div className="text-xl font-bold tracking-tighter">12k+</div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Daily Operations</div>
            </div>
            <div className="flex flex-col items-center md:items-start">
              <div className="text-xl font-bold tracking-tighter">SLA</div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Five Nines Uptime</div>
            </div>
          </div>
        </div>
      </section>

      {/* Showcase Section */}
      <section id="showcase" className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-24">
            <div className="flex-1 space-y-8">
              <div className="text-[11px] text-[#14c6cb] font-bold tracking-[3px] uppercase">
                Edge Processing
              </div>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tighter leading-[1.1]">
                Scan at the source. <br /> Orchestrate everywhere.
              </h2>
              <p className="text-slate-600 text-lg leading-relaxed max-w-lg">
                Our vision-driven edge interface allows kitchen staff to synchronize physical logistics with digital records in real-time.
              </p>
              
              <div className="space-y-6 pt-4">
                <div className="flex items-start gap-4">
                  <div className="mt-1 h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                    <CheckCircle2 className="h-3 w-3 text-[#14c6cb]" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm tracking-tight mb-1">Low-latency OCR</h4>
                    <p className="text-xs text-slate-500">Sub-second extraction of line items and pricing deltas.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="mt-1 h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                    <CheckCircle2 className="h-3 w-3 text-[#14c6cb]" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm tracking-tight mb-1">State Persistence</h4>
                    <p className="text-xs text-slate-500">Offline-first local buffers for intermittent kitchen connectivity.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 relative">
                <div className="absolute inset-0 bg-[#14c6cb]/5 blur-3xl rounded-full pointer-events-none" />
                <div className="relative p-2 rounded-lg border border-slate-200 shadow-xl bg-white">
                  <img src={scannerImg} alt="Mobile Scanner" className="rounded-sm w-full max-w-xs mx-auto aspect-[9/16] object-cover" />
                </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-32 border-t border-slate-100 bg-slate-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-20">
            <h2 className="text-3xl font-bold tracking-tighter mb-4">Enterprise Modules</h2>
            <div className="h-1 w-12 bg-[#14c6cb]" />
          </div>

          <div className="grid md:grid-cols-3 gap-y-16 gap-x-12">
            <FeatureCard 
              icon={<Zap className="h-5 w-5 text-[#14c6cb]" />}
              title="Automated Extraction"
              description="Transform paper invoices into structured JSON entities using multi-model visual analysis."
            />
            <FeatureCard 
              icon={<BarChart3 className="h-5 w-5 text-[#14c6cb]" />}
              title="Telemetry & Inventory"
              description="Real-time observability into ingredient cycles and replenishment thresholds across nodes."
            />
            <FeatureCard 
              icon={<ShieldCheck className="h-5 w-5 text-[#14c6cb]" />}
              title="Identity & Access"
              description="Granular RBAC and audit logging for every operational transaction within the platform."
            />
            <FeatureCard 
              icon={<Clock className="h-5 w-5 text-[#14c6cb]" />}
              title="Ordering Lifecycle"
              description="Automated reconciliation between predicted demand and supply-chain logistics."
            />
            <FeatureCard 
              icon={<Layers className="h-5 w-5 text-[#14c6cb]" />}
              title="Orchestration"
              description="Centralized command and control for multi-unit operators and ghost kitchen networks."
            />
            <FeatureCard 
              icon={<Sparkles className="h-5 w-5 text-[#14c6cb]" />}
              title="ML Analytics"
              description="Historical delta analysis to optimize procurement costs and minimize wastage overhead."
            />
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-3xl font-bold tracking-tighter mb-4">Scalable Licensing</h2>
            <p className="text-slate-500 text-sm">Predictable infrastructure costs for growing teams.</p>
          </div>

          <div className="max-w-sm mx-auto">
            <div className="p-8 rounded-sm bg-white border border-slate-200 relative group hover:border-[#14c6cb] transition-all duration-300">
              <div className="absolute top-0 right-0 p-4">
                <span className="bg-[#14c6cb]/10 text-[#14c6cb] text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-widest">Early Access</span>
              </div>
              <div className="mb-8">
                <h3 className="text-lg font-bold tracking-tight mb-4">Platform Unlimited</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-bold tracking-tighter">$149</span>
                  <span className="text-slate-400 font-bold text-xs uppercase tracking-widest ml-1">USD / Month</span>
                </div>
              </div>
              <ul className="space-y-4 mb-10">
                {[
                  "Unlimited visual extractions",
                  "Universal user access",
                  "Cross-module telemetry",
                  "Dedicated API endpoint",
                  "24/7 technical support"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-600 text-[13px] font-medium">
                    <ChevronRight className="h-4 w-4 text-[#14c6cb]" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button className="w-full h-11 bg-[#14c6cb] text-[#15181e] hover:bg-[#12adb1] font-bold text-xs tracking-[2px] rounded-sm uppercase" onClick={() => setIsDemoModalOpen(true)}>
                INITIATE ONBOARDING
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 bg-[#15181e] border-t border-white/5 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-12 mb-20">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-6 opacity-90">
                <Database className="h-5 w-5 text-[#14c6cb]" />
                <span className="text-xl font-bold tracking-tighter uppercase leading-none">EdgeOps</span>
              </div>
              <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
                Platform infrastructure for high-performance hospitality logistics and operational intelligence.
              </p>
            </div>
            <div>
              <h5 className="text-[10px] font-bold uppercase tracking-[3px] text-slate-500 mb-6">Product</h5>
              <ul className="space-y-4 text-sm text-slate-400">
                <li><a href="#features" className="hover:text-[#14c6cb] transition-colors">Infrastructure</a></li>
                <li><a href="#" className="hover:text-[#14c6cb] transition-colors">Telemetry</a></li>
                <li><a href="#" className="hover:text-[#14c6cb] transition-colors">Security</a></li>
              </ul>
            </div>
            <div>
              <h5 className="text-[10px] font-bold uppercase tracking-[3px] text-slate-500 mb-6">Connect</h5>
              <ul className="space-y-4 text-sm text-slate-400">
                <li><a href="#" className="hover:text-[#14c6cb] transition-colors">Docs</a></li>
                <li><a href="#" className="hover:text-[#14c6cb] transition-colors">Status</a></li>
                <li><a href="#" className="hover:text-[#14c6cb] transition-colors">Support</a></li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/5 gap-4">
            <p className="text-xs text-slate-600 font-medium tracking-tight">© 2026 EDGEOPS INC. ALL RIGHTS RESERVED.</p>
            <div className="flex gap-8 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                <a href="#" className="hover:text-white transition-colors">Privacy</a>
                <a href="#" className="hover:text-white transition-colors">Terms</a>
                <a href="#" className="hover:text-white transition-colors">Security</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Demo Request Modal */}
      <Dialog open={isDemoModalOpen} onOpenChange={setIsDemoModalOpen}>
        <DialogContent className="sm:max-w-[425px] bg-[#15181e] border-white/10 text-white p-0 overflow-hidden rounded-sm">
          <div className="h-1 bg-[#14c6cb] w-full" />
          <div className="p-8">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-2xl font-bold tracking-tighter text-white">
                Request Deployment
              </DialogTitle>
              <DialogDescription className="text-slate-400 text-sm">
                Initialize a custom environment walkthrough with our solutions team.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleDemoSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Full name</Label>
                <Input 
                  id="fullName" 
                  required 
                  value={demoForm.fullName}
                  onChange={(e) => setDemoForm({...demoForm, fullName: e.target.value})}
                  placeholder="JOHN DOE" 
                  className="bg-white/5 border-white/5 text-white placeholder:text-slate-700 focus:ring-[#14c6cb] rounded-sm uppercase text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Business email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  required 
                  value={demoForm.email}
                  onChange={(e) => setDemoForm({...demoForm, email: e.target.value})}
                  placeholder="JOHN@HOSPITALITY.COM" 
                  className="bg-white/5 border-white/5 text-white placeholder:text-slate-700 focus:ring-[#14c6cb] rounded-sm uppercase text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName" className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Company name</Label>
                <Input 
                  id="companyName" 
                  required 
                  value={demoForm.companyName}
                  onChange={(e) => setDemoForm({...demoForm, companyName: e.target.value})}
                  placeholder="ACME HOSPITALITY" 
                  className="bg-white/5 border-white/5 text-white placeholder:text-slate-700 focus:ring-[#14c6cb] rounded-sm uppercase text-xs"
                />
              </div>
              <DialogFooter className="pt-4">
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full bg-[#14c6cb] text-[#15181e] hover:bg-[#12adb1] font-bold py-6 text-xs tracking-[2px] rounded-sm uppercase"
                >
                  {isSubmitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> INITIALIZING...</>
                  ) : "SUBMIT REQUEST"}
                </Button>
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const FeatureCard = ({ icon, title, description }) => (
  <div className="group relative">
    <div className="mb-6 h-10 w-10 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-sm group-hover:border-[#14c6cb]/30 group-hover:bg-[#14c6cb]/5 transition-all duration-300">
      {icon}
    </div>
    <h3 className="text-base font-bold tracking-tight mb-2 uppercase">{title}</h3>
    <p className="text-slate-500 text-[13px] leading-relaxed pr-4">
      {description}
    </p>
    <div className="mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
      <div className="h-[1px] w-8 bg-[#14c6cb]" />
    </div>
  </div>
);
