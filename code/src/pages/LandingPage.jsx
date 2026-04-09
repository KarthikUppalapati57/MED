import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import InteractiveScene from '@/components/InteractiveScene';
import scannerImg from '../assets/scanner.png';
import { 
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
import { motion, useScroll, useTransform, useInView } from "framer-motion";

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

  const { scrollYProgress } = useScroll();
  const sphereScale = useTransform(scrollYProgress, [0, 0.2, 0.5, 1], [1, 1.2, 0.8, 0.5]);
  const sphereY = useTransform(scrollYProgress, [0, 1], [0, 500]);
  const opacityFade = useTransform(scrollYProgress, [0, 0.1], [1, 0.5]);

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
    <div className="min-h-screen bg-[#15181e] text-slate-900 selection:bg-brand-teal/30 font-sans antialiased overflow-x-hidden">
      {/* Persistent 3D Background Elements */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <motion.div 
          style={{ scale: sphereScale, y: sphereY }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[600px] max-w-5xl opacity-20"
        >
          <InteractiveScene />
        </motion.div>
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#15181e]/80 backdrop-blur-md">
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
              <button className="hover:text-white transition-colors" onClick={() => navigate('/login')}>Log in</button>
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
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-32 overflow-hidden text-white z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-3xl"
          >
            <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-sm bg-[#14c6cb]/10 border border-[#14c6cb]/20 text-[10px] font-bold tracking-[2px] uppercase text-[#14c6cb] mb-8">
              <Sparkles className="h-3 w-3" />
              Operational Automation System
            </div>
            
            <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-8 text-white leading-[0.9]">
              Infrastructure <br /> for your kitchen.
            </h1>
            
            <p className="max-w-xl text-lg text-slate-400 mb-10 leading-relaxed font-medium">
              Automated invoice extraction, real-time inventory synchronization, and AI-driven ordering lifecycle management. Built for the modern hospitality enterprise.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Button size="lg" className="h-12 px-10 bg-[#14c6cb] text-[#15181e] hover:bg-[#12adb1] font-bold text-sm tracking-widest rounded-sm transition-all shadow-[0_0_20px_rgba(20,198,203,0.3)]" onClick={() => setIsDemoModalOpen(true)}>
                REQUEST DEMO <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="h-12 px-10 border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold text-sm tracking-widest rounded-sm">
                VIEW DOCS
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Main Content Area (White background sections) */}
      <div className="relative bg-white rounded-t-[4rem] z-10 mt-20">
        
        {/* Stats Bar */}
        <section className="py-12 border-b border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
              <StatItem value="99.8%" label="Extraction Accuracy" />
              <StatItem value="1.4ms" label="Sync Latency" />
              <StatItem value="12k+" label="Daily Operations" />
              <StatItem value="SLA" label="Five Nines Uptime" />
            </div>
          </div>
        </section>

        {/* Showcase Section */}
        <section id="showcase" className="py-32">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row items-center gap-24">
              <motion.div 
                initial={{ opacity: 0, x: -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
                className="flex-1 space-y-8"
              >
                <div className="text-[11px] text-[#14c6cb] font-bold tracking-[3px] uppercase">
                  Edge Processing
                </div>
                <h2 className="text-5xl md:text-6xl font-bold tracking-tighter leading-[1.1]">
                  Scan at the source. <br /> Orchestrate everywhere.
                </h2>
                <p className="text-slate-600 text-xl leading-relaxed max-w-lg font-medium">
                  Our vision-driven edge interface allows kitchen staff to synchronize physical logistics with digital records in real-time.
                </p>
                
                <div className="space-y-6 pt-4">
                  <CheckItem title="Low-latency OCR" desc="Sub-second extraction of line items and pricing deltas." />
                  <CheckItem title="State Persistence" desc="Offline-first local buffers for intermittent kitchen connectivity." />
                </div>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1, type: "spring" }}
                className="flex-1 relative"
              >
                  <div className="absolute inset-0 bg-[#14c6cb]/5 blur-3xl rounded-full pointer-events-none" />
                  <div className="relative p-2 rounded-2xl border border-slate-200 shadow-2xl bg-white overflow-hidden group">
                    <img src={scannerImg} alt="Mobile Scanner" className="rounded-xl w-full max-w-xs mx-auto aspect-[9/16] object-cover filter saturate-0 group-hover:saturate-100 transition-all duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent opacity-60" />
                  </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-32 bg-slate-50/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-20"
            >
              <h2 className="text-4xl font-bold tracking-tighter mb-4">Enterprise Modules</h2>
              <div className="h-1.5 w-16 bg-[#14c6cb]" />
            </motion.div>

            <div className="grid md:grid-cols-3 gap-y-20 gap-x-16">
              <FeatureCard 
                icon={<Zap className="h-6 w-6 text-[#14c6cb]" />}
                title="Automated Extraction"
                description="Transform paper invoices into structured JSON entities using multi-model visual analysis."
                delay={0}
              />
              <FeatureCard 
                icon={<BarChart3 className="h-6 w-6 text-[#14c6cb]" />}
                title="Telemetry & Inventory"
                description="Real-time observability into ingredient cycles and replenishment thresholds across nodes."
                delay={0.1}
              />
              <FeatureCard 
                icon={<ShieldCheck className="h-6 w-6 text-[#14c6cb]" />}
                title="Identity & Access"
                description="Granular RBAC and audit logging for every operational transaction within the platform."
                delay={0.2}
              />
              <FeatureCard 
                icon={<Clock className="h-6 w-6 text-[#14c6cb]" />}
                title="Ordering Lifecycle"
                description="Automated reconciliation between predicted demand and supply-chain logistics."
                delay={0.3}
              />
              <FeatureCard 
                icon={<Layers className="h-6 w-6 text-[#14c6cb]" />}
                title="Orchestration"
                description="Centralized command and control for multi-unit operators and ghost kitchen networks."
                delay={0.4}
              />
              <FeatureCard 
                icon={<Sparkles className="h-6 w-6 text-[#14c6cb]" />}
                title="ML Analytics"
                description="Historical delta analysis to optimize procurement costs and minimize wastage overhead."
                delay={0.5}
              />
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-40 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-24">
              <h2 className="text-5xl font-bold tracking-tighter mb-6">Scalable Licensing</h2>
              <p className="text-slate-500 text-lg font-medium">Predictable infrastructure costs for growing teams.</p>
            </div>

            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-sm mx-auto"
            >
              <div className="p-10 rounded-3xl bg-white border border-slate-200 relative group hover:border-[#14c6cb] transition-all duration-500 hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.1)]">
                <div className="absolute top-0 right-0 p-6">
                  <span className="bg-[#14c6cb]/10 text-[#14c6cb] text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">Early Access</span>
                </div>
                <div className="mb-10">
                  <h3 className="text-xl font-bold tracking-tight mb-6">Platform Unlimited</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-7xl font-bold tracking-tighter">$149</span>
                    <span className="text-slate-400 font-bold text-sm uppercase tracking-[3px]">USD / Mo</span>
                  </div>
                </div>
                <ul className="space-y-6 mb-12">
                  {[
                    "Unlimited visual extractions",
                    "Universal user access",
                    "Cross-module telemetry",
                    "Dedicated API endpoint",
                    "24/7 technical support"
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-4 text-slate-600 text-sm font-bold">
                      <div className="h-1.5 w-1.5 rounded-full bg-[#14c6cb]" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button className="w-full h-14 bg-[#14c6cb] text-[#15181e] hover:bg-[#12adb1] font-bold text-xs tracking-[3px] rounded-xl uppercase transition-all hover:scale-[1.02]" onClick={() => setIsDemoModalOpen(true)}>
                  INITIATE ONBOARDING
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-32 bg-[#15181e] border-t border-white/5 text-white rounded-t-[4rem]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-4 gap-20 mb-24">
              <div className="col-span-2">
                <div className="flex items-center gap-2 mb-8">
                  <Database className="h-7 w-7 text-[#14c6cb]" />
                  <span className="text-3xl font-bold tracking-tighter uppercase leading-none">EdgeOps</span>
                </div>
                <p className="text-slate-500 text-lg max-w-xs leading-relaxed font-medium">
                  Platform infrastructure for high-performance hospitality logistics and operational intelligence.
                </p>
              </div>
              <div>
                <h5 className="text-[10px] font-bold uppercase tracking-[4px] text-slate-500 mb-8">Product</h5>
                <ul className="space-y-5 text-sm font-bold text-slate-400">
                  <li><a href="#features" className="hover:text-white transition-colors">Infrastructure</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Telemetry</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
                </ul>
              </div>
              <div>
                <h5 className="text-[10px] font-bold uppercase tracking-[4px] text-slate-500 mb-8">Connect</h5>
                <ul className="space-y-5 text-sm font-bold text-slate-400">
                  <li><a href="#" className="hover:text-white transition-colors">Docs</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Status</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Support</a></li>
                </ul>
              </div>
            </div>
            <div className="flex flex-col md:flex-row justify-between items-center pt-12 border-t border-white/5 gap-6">
              <p className="text-xs text-slate-600 font-bold tracking-widest">© 2026 EDGEOPS INC. ALL RIGHTS RESERVED.</p>
              <div className="flex gap-12 text-[10px] font-bold uppercase tracking-[4px] text-slate-500">
                  <a href="#" className="hover:text-white transition-colors">Privacy</a>
                  <a href="#" className="hover:text-white transition-colors">Terms</a>
                  <a href="#" className="hover:text-white transition-colors">Security</a>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Demo Request Modal */}
      <Dialog open={isDemoModalOpen} onOpenChange={setIsDemoModalOpen}>
        <DialogContent className="sm:max-w-[425px] bg-[#15181e] border-white/10 text-white p-0 overflow-hidden rounded-3xl">
          <div className="h-1.5 bg-[#14c6cb] w-full" />
          <div className="p-10">
            <DialogHeader className="mb-8">
              <DialogTitle className="text-3xl font-bold tracking-tighter text-white">
                Request Deployment
              </DialogTitle>
              <DialogDescription className="text-slate-400 text-base font-medium">
                Initialize a custom environment walkthrough with our solutions team.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleDemoSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-[10px] font-bold uppercase tracking-[3px] text-slate-500">Full name</Label>
                <Input 
                  id="fullName" 
                  required 
                  value={demoForm.fullName}
                  onChange={(e) => setDemoForm({...demoForm, fullName: e.target.value})}
                  placeholder="JOHN DOE" 
                  className="bg-white/5 border-white/5 h-12 text-white placeholder:text-slate-700 focus:ring-[#14c6cb] rounded-xl uppercase text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-[3px] text-slate-500">Business email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  required 
                  value={demoForm.email}
                  onChange={(e) => setDemoForm({...demoForm, email: e.target.value})}
                  placeholder="JOHN@HOSPITALITY.COM" 
                  className="bg-white/5 border-white/5 h-12 text-white placeholder:text-slate-700 focus:ring-[#14c6cb] rounded-xl uppercase text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName" className="text-[10px] font-bold uppercase tracking-[3px] text-slate-500">Company name</Label>
                <Input 
                  id="companyName" 
                  required 
                  value={demoForm.companyName}
                  onChange={(e) => setDemoForm({...demoForm, companyName: e.target.value})}
                  placeholder="ACME HOSPITALITY" 
                  className="bg-white/5 border-white/5 h-12 text-white placeholder:text-slate-700 focus:ring-[#14c6cb] rounded-xl uppercase text-xs"
                />
              </div>
              <DialogFooter className="pt-6">
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full bg-[#14c6cb] text-[#15181e] hover:bg-[#12adb1] font-bold py-7 text-xs tracking-[4px] rounded-xl uppercase shadow-[0_20px_40px_-10px_rgba(20,198,203,0.3)] transition-all active:scale-95"
                >
                  {isSubmitting ? (
                    <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> INITIALIZING...</>
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

const StatItem = ({ value, label }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    className="flex flex-col items-center md:items-start"
  >
    <div className="text-4xl font-bold tracking-tighter mb-2">{value}</div>
    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-[3px]">{label}</div>
  </motion.div>
);

const CheckItem = ({ title, desc }) => (
  <div className="flex items-start gap-4 group">
    <div className="mt-1 h-6 w-6 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:border-[#14c6cb] transition-colors">
      <CheckCircle2 className="h-3.5 w-3.5 text-[#14c6cb]" />
    </div>
    <div>
      <h4 className="font-bold text-base tracking-tight mb-1">{title}</h4>
      <p className="text-sm text-slate-500 font-medium">{desc}</p>
    </div>
  </div>
);

const FeatureCard = ({ icon, title, description, delay }) => (
  <motion.div 
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay, duration: 0.6 }}
    className="group relative"
  >
    <div className="mb-8 h-14 w-14 flex items-center justify-center bg-white border border-slate-100 rounded-2xl shadow-sm group-hover:border-[#14c6cb]/30 group-hover:bg-[#14c6cb]/5 transition-all duration-500 group-hover:shadow-[0_20px_40px_-10px_rgba(20,198,203,0.1)]">
      {icon}
    </div>
    <h3 className="text-lg font-bold tracking-tight mb-3 uppercase">{title}</h3>
    <p className="text-slate-500 text-sm leading-relaxed pr-8 font-medium">
      {description}
    </p>
    <div className="mt-6 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-x-[-10px] group-hover:translate-x-0">
      <div className="h-0.5 w-10 bg-[#14c6cb]" />
    </div>
  </motion.div>
);

