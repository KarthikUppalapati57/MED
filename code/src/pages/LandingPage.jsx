import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import InteractiveScene from '@/components/InteractiveScene';
import { ThemeToggle } from '@/components/ThemeToggle';
import RestopsLogo from '@/components/RestopsLogo';
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
import { motion, useScroll, useTransform } from "framer-motion";
import Lenis from '@studio-freight/lenis';

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

  // SMOOTH SCROLL (Lenis)
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1,
      smoothTouch: false,
      touchMultiplier: 2,
      infinite: false,
    });

    let frameId;
    function raf(time) {
      lenis.raf(time);
      frameId = requestAnimationFrame(raf);
    }

    frameId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frameId);
      lenis.destroy();
    };
  }, []);

  const { scrollYProgress } = useScroll();
  const sphereScale = useTransform(scrollYProgress, [0, 1], [1, 1.2]);
  const sphereOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0.8]);

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

      // Fire-and-forget: notify platform admins via Edge Function
      try {
        await supabase.functions.invoke('notify-demo-request', {
          body: {
            full_name: demoForm.fullName,
            email: demoForm.email,
            company_name: demoForm.companyName,
            phone: demoForm.phone,
            plan: demoForm.plan,
          }
        });
      } catch (_notifyErr) {
        // Non-blocking: notification failure shouldn't affect the user flow
        console.warn('Demo notification dispatch failed (non-critical):', _notifyErr);
      }

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
    <div className="min-h-screen bg-[#FAF8F4] dark:bg-background text-black dark:text-foreground selection:bg-[#ff5c35]/30 font-sans antialiased overflow-x-hidden selection:text-white">
      
      {/* 3D BACKBONE (Sticky Backdrop) */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <motion.div 
          style={{ scale: sphereScale, opacity: sphereOpacity }}
          className="absolute inset-0 flex items-center justify-center opacity-40"
        >
          <div className="w-full h-full max-w-7xl max-h-[100vh]">
            <InteractiveScene />
          </div>
        </motion.div>
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-black/5 dark:border-white/5 bg-[#FAF8F4]/80 dark:bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <RestopsLogo className="h-16 ml-4 mt-2" origin="origin-left" />
            </div>
            
            <div className="hidden md:flex items-center gap-8 text-[11px] font-bold tracking-[2px] text-black/40 dark:text-white/40 uppercase">
              <a href="#features" className="hover:text-[#ff5c35] transition-colors">Infrastructure</a>
              <a href="#showcase" className="hover:text-[#ff5c35] transition-colors">Telemetry</a>
              <a href="#pricing" className="hover:text-[#ff5c35] transition-colors">Pricing</a>
              <div className="h-4 w-[1px] bg-black/10 dark:bg-white/10 mx-2" />
              <ThemeToggle />
              <button className="hover:text-black dark:hover:text-white transition-colors" onClick={() => navigate('/login')}>Log in</button>
              <Button 
                className="bg-black dark:bg-white text-white dark:text-black hover:bg-[#ff5c35] dark:hover:bg-[#ff5c35] dark:hover:text-white font-bold text-[10px] tracking-[2px] h-8 px-4 rounded-sm transition-all uppercase"
                onClick={() => setIsDemoModalOpen(true)}
              >
                BOOK DEMO
              </Button>
            </div>

            <div className="md:hidden">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-black/40">
                {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-48 pb-40 overflow-hidden z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-4xl"
          >
            <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-sm bg-[#ff5c35]/5 border border-[#ff5c35]/20 text-[10px] font-bold tracking-[3px] uppercase text-[#ff5c35] mb-12">
              <Sparkles className="h-3 w-3" />
              Intelligence Orchestration
            </div>
            
            <h1 className="text-fluid-h1 text-[clamp(3.35rem,8.8vw,7rem)] md:text-[clamp(4.5rem,9.5vw,8.25rem)] font-bold technical-tracking text-black dark:text-white mb-12 leading-[0.92]">
              Building <br /> technical <br /> kitchens.
            </h1>
            
            <p className="max-w-xl text-xl text-black/60 dark:text-white/60 mb-16 leading-relaxed font-medium technical-tracking">
              EdgeOps delivers automated logistics, AI-driven inventory telemetry, and sovereign infrastructure for the modern hospitality enterprise.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-6">
              <Button size="lg" className="h-14 px-12 bg-[#ff5c35] text-white hover:bg-black font-bold text-xs tracking-[4px] rounded-sm transition-all shadow-xl shadow-[#ff5c35]/20 uppercase" onClick={() => setIsDemoModalOpen(true)}>
                REQUEST ACCESS <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="link"
                className="text-black dark:text-white font-bold text-xs tracking-[3px] uppercase hover:text-[#ff5c35]"
                onClick={() => navigate('/docs')}
              >
                VIEW DOCUMENTATION
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Bar (Minimal technical style) */}
      <section className="relative py-12 border-y border-black/5 dark:border-white/10 z-10 bg-[#F2EEE8]/80 dark:bg-background/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-16">
            <StatItem value="99.9%" label="Sync Fidelity" />
            <StatItem value="0.8ms" label="Latency Delta" />
            <StatItem value="150+" label="Global Nodes" />
            <StatItem value="24/7" label="Uptime Metric" />
          </div>
        </div>
      </section>

      {/* Content Sections */}
      <div className="relative z-10 space-y-40 py-40">
        
        {/* Showcase Section */}
        <section id="showcase">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row items-center gap-32">
              <motion.div 
                initial={{ opacity: 0, x: -60 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                className="flex-1 space-y-12"
              >
                <div className="text-[11px] text-[#ff5c35] font-bold tracking-[4px] uppercase">
                  Edge Logics
                </div>
                <h2 className="text-5xl md:text-7xl font-bold tracking-tighter leading-[1] text-black dark:text-white">
                  Decentralized <br /> Kitchen Ops.
                </h2>
                <p className="text-black/50 dark:text-white/70 text-xl leading-relaxed max-w-lg font-medium technical-tracking">
                  Our vision-driven interface allows your frontline staff to synchronize physical logistics with high-fidelity digital audits instantly.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6">
                  <CheckItem title="Low-latency OCR" desc="Sub-second extraction." />
                  <CheckItem title="State Persistence" desc="Offline-first buffers." />
                </div>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, scale: 0.9, rotate: -5 }}
                whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 1.5, type: "spring" }}
                className="flex-1"
              >
                  <div className="relative p-1 bg-gradient-to-br from-black/10 to-transparent rounded-sm overflow-hidden">
                    <img src={scannerImg} alt="Interface" className="w-full max-w-sm mx-auto filter grayscale opacity-90 transition-all duration-1000 hover:grayscale-0 hover:opacity-100" />
                    <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#FAF8F4] to-transparent" />
                  </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Features Modules */}
        <section id="features">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-32"
            >
              <h2 className="text-4xl font-bold tracking-tighter mb-4 text-black dark:text-white">Infrastructure Modules</h2>
              <div className="h-0.5 w-16 bg-[#ff5c35]" />
            </motion.div>

            <div className="grid md:grid-cols-3 gap-y-32 gap-x-20">
              <FeatureCard icon={<Zap />} title="Extraction" description="Transform paper into structured JSON entities via multi-modal analysis." delay={0} />
              <FeatureCard icon={<BarChart3 />} title="Telemetry" description="Real-time observability into replenishment thresholds." delay={0.1} />
              <FeatureCard icon={<ShieldCheck />} title="Identity" description="Granular RBAC and audit logging for every single action." delay={0.2} />
              <FeatureCard icon={<Clock />} title="Lifecycle" description="Automated reconciliation between demand and logistics." delay={0.3} />
              <FeatureCard icon={<Layers />} title="Orchestration" description="Centralized command for multi-unit ghost kitchen networks." delay={0.4} />
              <FeatureCard icon={<Sparkles />} title="Intelligence" description="ML-driven delta analysis to optimize procurement costs." delay={0.5} />
            </div>
          </div>
        </section>

        {/* Pricing (Technical Card style) */}
        <section id="pricing">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-32">
              <h2 className="text-5xl font-bold tracking-tighter mb-6 text-black dark:text-white">Licensing</h2>
              <p className="text-black/40 dark:text-white/60 text-lg font-bold tracking-widest uppercase">Select your tier</p>
            </div>

            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-md mx-auto"
            >
              <div className="p-12 bg-[#F2EEE8] dark:bg-white/5 dark:border dark:border-white/10 mistral-border relative group hover:shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] transition-all duration-700">
                <div className="absolute top-0 right-0 p-8">
                  <span className="text-[10px] font-bold px-3 py-1 bg-black text-white uppercase tracking-[4px]">Private Beta</span>
                </div>
                <div className="mb-16">
                  <h3 className="text-2xl font-bold tracking-tight mb-8 text-black dark:text-white">Platform Complete</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-8xl font-bold tracking-tighter text-black dark:text-white">$149</span>
                    <span className="text-black/30 dark:text-white/50 font-bold text-sm uppercase tracking-[4px]">USD / Mo</span>
                  </div>
                </div>
                <ul className="space-y-6 mb-16">
                  {["Unlimited visual extractions", "Universal user access", "Full-stack telemetry", "Dedicated API instance", "24/7 technical escort"].map((item, i) => (
                    <li key={i} className="flex items-center gap-4 text-black/60 dark:text-white/70 text-xs font-bold uppercase tracking-widest">
                      <div className="h-1 w-1 bg-[#ff5c35]" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button className="w-full h-16 bg-black text-white hover:bg-[#ff5c35] font-bold text-[10px] tracking-[5px] rounded-sm uppercase transition-all shadow-2xl" onClick={() => setIsDemoModalOpen(true)}>
                  JOIN WAITLIST
                </Button>
              </div>
            </motion.div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="relative py-40 border-t border-black/5 dark:border-white/10 bg-[#FAF8F4] dark:bg-background z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-24 mb-32">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-10">
                <RestopsLogo className="h-24" origin="origin-left" />
              </div>
              <p className="text-black/40 dark:text-white/60 text-lg max-w-xs leading-relaxed font-medium technical-tracking">
                Sovereign infrastructure for high-performance hospitality logistics and telemetry.
              </p>
            </div>
            <div>
              <h5 className="text-[10px] font-bold uppercase tracking-[5px] text-black/20 dark:text-white/40 mb-10">Systems</h5>
              <ul className="space-y-6 text-[11px] font-bold text-black/60 dark:text-white/70 uppercase tracking-widest">
                <li><a href="#features" className="hover:text-[#ff5c35] transition-colors">Core Nodes</a></li>
                <li><a href="#" className="hover:text-[#ff5c35] transition-colors">Security</a></li>
              </ul>
            </div>
            <div>
              <h5 className="text-[10px] font-bold uppercase tracking-[5px] text-black/20 dark:text-white/40 mb-10">Resources</h5>
              <ul className="space-y-6 text-[11px] font-bold text-black/60 dark:text-white/70 uppercase tracking-widest">
                <li><a href="#" className="hover:text-[#ff5c35] transition-colors">API Docs</a></li>
                <li><a href="#" className="hover:text-[#ff5c35] transition-colors">Support</a></li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center pt-12 border-t border-black/5 dark:border-white/10 gap-8">
            <p className="text-[9px] text-black/30 font-bold tracking-[5px] uppercase">© 2026 EDGEOPS INC. BUILT FOR SCALE.</p>
            <div className="flex gap-16 text-[9px] font-bold uppercase tracking-[5px] text-black/30 dark:text-white/40">
                <a href="#" className="hover:text-black dark:hover:text-white transition-colors">Privacy</a>
                <a href="#" className="hover:text-black dark:hover:text-white transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Demo Request Modal */}
      <Dialog open={isDemoModalOpen} onOpenChange={setIsDemoModalOpen}>
        <DialogContent className="sm:max-w-[450px] bg-[#FAF8F4] border-black/10 text-black p-0 overflow-hidden rounded-sm">
          <div className="h-1 bg-[#ff5c35] w-full" />
          <div className="p-12">
            <DialogHeader className="mb-10">
              <DialogTitle className="text-4xl font-bold tracking-tighter text-black">
                Request <br /> Deployment
              </DialogTitle>
              <DialogDescription className="text-black/40 text-sm font-bold tracking-widest uppercase mt-4">
                Initialize your workspace.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleDemoSubmit} className="space-y-8">
              <div className="space-y-3">
                <Label htmlFor="fullName" className="text-[10px] font-bold uppercase tracking-[4px] text-black/20">Full Identity</Label>
                <Input id="fullName" required value={demoForm.fullName} onChange={(e) => setDemoForm({...demoForm, fullName: e.target.value})} placeholder="JOHN DOE" className="bg-[#F2EEE8] border-black/5 h-12 text-black placeholder:text-black/10 focus:ring-[#ff5c35] rounded-none uppercase text-xs font-bold" />
              </div>
              <div className="space-y-3">
                <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-[4px] text-black/20">Technical Email</Label>
                <Input id="email" type="email" required value={demoForm.email} onChange={(e) => setDemoForm({...demoForm, email: e.target.value})} placeholder="JOHN@OPS.COM" className="bg-[#F2EEE8] border-black/5 h-12 text-black placeholder:text-black/10 focus:ring-[#ff5c35] rounded-none uppercase text-xs font-bold" />
              </div>
              <div className="space-y-3">
                <Label htmlFor="companyName" className="text-[10px] font-bold uppercase tracking-[4px] text-black/20">Enterprise Name</Label>
                <Input id="companyName" required value={demoForm.companyName} onChange={(e) => setDemoForm({...demoForm, companyName: e.target.value})} placeholder="ACME LOGISTICS" className="bg-[#F2EEE8] border-black/5 h-12 text-black placeholder:text-black/10 focus:ring-[#ff5c35] rounded-none uppercase text-xs font-bold" />
              </div>
              <DialogFooter className="pt-8">
                <Button type="submit" disabled={isSubmitting} className="w-full bg-[#ff5c35] text-white hover:bg-black font-bold py-8 text-xs tracking-[5px] rounded-none uppercase shadow-2xl">
                  {isSubmitting ? "INITIALIZING..." : "SUBMIT REQUEST"}
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
    initial={{ opacity: 0, scale: 0.9 }}
    whileInView={{ opacity: 1, scale: 1 }}
    viewport={{ once: true }}
    className="flex flex-col items-center md:items-start"
  >
    <div className="text-5xl font-bold tracking-tighter mb-4 text-black dark:text-white">{value}</div>
    <div className="text-[10px] text-black/30 dark:text-white/50 font-bold uppercase tracking-[4px]">{label}</div>
  </motion.div>
);

const CheckItem = ({ title, desc }) => (
  <div className="space-y-2 group">
    <div className="flex items-center gap-3">
      <CheckCircle2 className="h-4 w-4 text-[#ff5c35]" />
      <h4 className="font-bold text-sm tracking-[2px] uppercase mb-0 text-black dark:text-white">{title}</h4>
    </div>
    <p className="text-xs text-black/40 dark:text-white/60 font-bold uppercase tracking-widest pl-7">{desc}</p>
  </div>
);

const FeatureCard = ({ icon, title, description, delay }) => (
  <motion.div 
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay, duration: 1, ease: [0.16, 1, 0.3, 1] }}
    className="group relative"
  >
    <div className="mb-10 text-[#ff5c35]">
      {React.cloneElement(icon, { size: 32, strokeWidth: 1 })}
    </div>
    <h3 className="text-xl font-bold tracking-tighter mb-4 uppercase text-black dark:text-white">{title}</h3>
    <p className="text-black/50 dark:text-white/70 text-sm leading-relaxed pr-10 font-medium technical-tracking">
      {description}
    </p>
    <div className="mt-8 opacity-0 group-hover:opacity-100 transition-all duration-700">
      <div className="h-[2px] w-12 bg-black dark:bg-white" />
    </div>
  </motion.div>
);

