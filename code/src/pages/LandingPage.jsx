import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import InteractiveScene from '@/components/InteractiveScene';
import RestopsLogo from '@/components/RestopsLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
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
  ChevronRight
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
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import Lenis from '@studio-freight/lenis';

// Magnetic Button Component for premium hover effects
const MagneticButton = ({ children, onClick, className }) => {
  const ref = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouse = (e) => {
    const { clientX, clientY } = e;
    const { height, width, left, top } = ref.current.getBoundingClientRect();
    const middleX = clientX - (left + width / 2);
    const middleY = clientY - (top + height / 2);
    setPosition({ x: middleX * 0.2, y: middleY * 0.2 });
  };

  const reset = () => {
    setPosition({ x: 0, y: 0 });
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={reset}
      animate={{ x: position.x, y: position.y }}
      transition={{ type: "spring", stiffness: 150, damping: 15, mass: 0.1 }}
    >
      <Button className={className} onClick={onClick}>
        {children}
      </Button>
    </motion.div>
  );
};

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
  const smoothProgress = useSpring(scrollYProgress, { damping: 15, mass: 0.27, stiffness: 55 });
  
  const heroOpacity = useTransform(smoothProgress, [0, 0.15], [1, 0]);
  const heroScale = useTransform(smoothProgress, [0, 0.15], [1, 0.9]);
  const navBackground = useTransform(smoothProgress, [0, 0.05], ["transparent", "hsl(var(--background) / 0.85)"]);
  const navBorder = useTransform(smoothProgress, [0, 0.05], ["transparent", "hsl(var(--border) / 0.8)"]);

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
    <div className="min-h-screen bg-background text-foreground selection:bg-brand/30 font-sans antialiased overflow-x-hidden">
      
      {/* 3D BACKBONE */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <InteractiveScene />
      </div>

      {/* Navigation */}
      <motion.nav 
        style={{ backgroundColor: navBackground, borderColor: navBorder, backdropFilter: "blur(12px)" }}
        className="fixed top-0 w-full z-50 border-b"
      >
        <div className="w-full max-w-[2400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <RestopsLogo className="h-8" />
            
            <div className="hidden md:flex items-center gap-8 text-[11px] font-bold tracking-[2px] text-muted-foreground uppercase">
              <a href="#features" className="hover:text-foreground transition-colors">Infrastructure</a>
              <a href="#showcase" className="hover:text-foreground transition-colors">Telemetry</a>
              <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
              <div className="h-4 w-[1px] bg-border mx-2" />
              <ThemeToggle />
              <button className="hover:text-foreground transition-colors" onClick={() => navigate('/login')}>Log in</button>
              
              <MagneticButton 
                className="bg-foreground text-background hover:bg-brand hover:text-foreground font-bold text-[10px] tracking-[2px] h-9 px-5 rounded-full transition-all uppercase"
                onClick={() => setIsDemoModalOpen(true)}
              >
                BOOK DEMO
              </MagneticButton>
            </div>

            <div className="md:hidden">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-muted-foreground">
                {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section className="relative h-screen flex flex-col justify-center overflow-hidden z-10 pt-20">
        <div className="w-full max-w-[2400px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <motion.div 
            style={{ opacity: heroOpacity, scale: heroScale }}
            className="max-w-5xl"
          >
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/10 border border-brand/20 text-[10px] font-bold tracking-[3px] uppercase text-brand mb-8"
            >
              <Sparkles className="h-3 w-3" />
              Intelligence Orchestration
            </motion.div>
            
            <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-[110px] leading-[0.9] font-bold tracking-tighter text-foreground mb-8">
              <motion.span 
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="block"
              >Building</motion.span>
              <motion.span 
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="block text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-300 to-gray-500"
              >technical</motion.span>
              <motion.span 
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="block"
              >kitchens.</motion.span>
            </h1>
            
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.8 }}
              className="max-w-xl text-lg sm:text-xl text-foreground/50 mb-12 leading-relaxed font-medium tracking-wide"
            >
              Restops delivers automated logistics, AI-driven inventory telemetry, and sovereign infrastructure for the modern hospitality enterprise.
            </motion.p>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 1 }}
              className="flex flex-col sm:flex-row items-center gap-6"
            >
              <MagneticButton 
                className="h-14 px-10 bg-foreground text-background hover:bg-brand hover:text-foreground font-bold text-xs tracking-[3px] rounded-full transition-all uppercase shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_40px_-10px_rgba(255,92,53,0.6)]" 
                onClick={() => setIsDemoModalOpen(true)}
              >
                REQUEST ACCESS <ChevronRight className="ml-2 h-4 w-4" />
              </MagneticButton>
              <Link to="/docs" className="text-muted-foreground font-bold text-xs tracking-[3px] uppercase hover:text-foreground transition-colors flex items-center group">
                VIEW DOCUMENTATION 
                <span className="block ml-2 w-0 h-[1px] bg-foreground group-hover:w-4 transition-all duration-300" />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Content wrapper now transparent to show 3D scene below fold */}
      <div className="relative z-10 bg-transparent border-t border-border shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
        
        {/* Stats Bar */}
        <section className="py-16 border-b border-border bg-gradient-to-b from-white/[0.02] to-transparent">
          <div className="w-full max-w-[2400px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-16">
              <StatItem value="99.9%" label="Sync Fidelity" />
              <StatItem value="0.8ms" label="Latency Delta" />
              <StatItem value="150+" label="Global Nodes" />
              <StatItem value="24/7" label="Uptime Metric" />
            </div>
          </div>
        </section>

        {/* Showcase Section */}
        <section id="showcase" className="py-40">
          <div className="w-full max-w-[2400px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row items-center gap-32">
              <motion.div 
                initial={{ opacity: 0, x: -60 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                className="flex-1 space-y-12"
              >
                <div className="text-[11px] text-brand font-bold tracking-[4px] uppercase">
                  Edge Logics
                </div>
                <h2 className="text-5xl md:text-7xl font-bold tracking-tighter leading-[1] text-foreground">
                  Decentralized <br /> <span className="text-muted-foreground/60">Kitchen Ops.</span>
                </h2>
                <p className="text-foreground/50 text-xl leading-relaxed max-w-lg font-medium">
                  Our vision-driven interface allows your frontline staff to synchronize physical logistics with high-fidelity digital audits instantly.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6">
                  <CheckItem title="Low-latency OCR" desc="Sub-second extraction." />
                  <CheckItem title="State Persistence" desc="Offline-first buffers." />
                </div>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, scale: 0.9, rotate: 2 }}
                whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 1.5, type: "spring" }}
                className="flex-1 relative"
              >
                  {/* Decorative glow behind image */}
                  <div className="absolute inset-0 bg-brand/20 blur-[100px] rounded-full" />
                  <div className="relative p-[1px] bg-gradient-to-br from-white/20 via-white/5 to-transparent rounded-2xl overflow-hidden backdrop-blur-sm">
                    <div className="bg-[#0a0a0f]/40 backdrop-blur-md rounded-2xl overflow-hidden">
                      <img src={scannerImg} alt="Interface" className="w-full max-w-sm mx-auto filter brightness-75 contrast-125 transition-all duration-1000 hover:brightness-100" />
                    </div>
                  </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Features Modules */}
        <section id="features" className="py-32 bg-black/20 backdrop-blur-sm border-y border-border">
          <div className="w-full max-w-[2400px] mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-32 flex flex-col items-center text-center"
            >
              <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-6 text-foreground">Infrastructure Modules</h2>
              <p className="text-muted-foreground/60 max-w-xl text-lg">Completely modular, enterprise-grade systems designed to automate the manual toil of restaurant management.</p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6">
              <FeatureCard icon={<Zap />} title="Extraction" description="Transform paper into structured JSON entities via multi-modal analysis." delay={0} />
              <FeatureCard icon={<BarChart3 />} title="Telemetry" description="Real-time observability into replenishment thresholds." delay={0.1} />
              <FeatureCard icon={<ShieldCheck />} title="Identity" description="Granular RBAC and audit logging for every single action." delay={0.2} />
              <FeatureCard icon={<Clock />} title="Lifecycle" description="Automated reconciliation between demand and logistics." delay={0.3} />
              <FeatureCard icon={<Layers />} title="Orchestration" description="Centralized command for multi-unit ghost kitchen networks." delay={0.4} />
              <FeatureCard icon={<Sparkles />} title="Intelligence" description="ML-driven delta analysis to optimize procurement costs." delay={0.5} />
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-40">
          <div className="w-full max-w-[2400px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-24">
              <h2 className="text-5xl font-bold tracking-tighter mb-6 text-foreground">Licensing</h2>
              <p className="text-muted-foreground/60 text-lg font-bold tracking-widest uppercase">Select your tier</p>
            </div>

            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-md mx-auto"
            >
              <div className="relative group p-[1px] rounded-3xl bg-gradient-to-b from-white/20 to-white/5 hover:from-[#ff5c35]/50 transition-all duration-700">
                <div className="absolute inset-0 bg-brand/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="relative p-12 bg-[#0a0a0f]/60 rounded-3xl h-full backdrop-blur-xl">
                  <div className="absolute top-0 right-0 p-8">
                    <span className="text-[9px] font-bold px-3 py-1 bg-foreground/10 text-foreground rounded-full uppercase tracking-[2px]">Private Beta</span>
                  </div>
                  <div className="mb-12">
                    <h3 className="text-2xl font-bold tracking-tight mb-6 text-foreground">Platform Complete</h3>
                    <div className="flex items-baseline gap-2">
                      <span className="text-7xl font-bold tracking-tighter text-foreground">$149</span>
                      <span className="text-foreground/30 font-bold text-sm uppercase tracking-[2px]">/ Mo</span>
                    </div>
                  </div>
                  <ul className="space-y-6 mb-12">
                    {["Unlimited visual extractions", "Universal user access", "Full-stack telemetry", "Dedicated API instance", "24/7 technical escort"].map((item, i) => (
                      <li key={i} className="flex items-center gap-4 text-muted-foreground text-xs font-medium uppercase tracking-widest">
                        <CheckCircle2 className="w-4 h-4 text-brand" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <MagneticButton 
                    className="w-full h-14 bg-foreground text-background hover:bg-brand hover:text-foreground font-bold text-[10px] tracking-[4px] rounded-full uppercase transition-all shadow-xl" 
                    onClick={() => setIsDemoModalOpen(true)}
                  >
                    JOIN WAITLIST
                  </MagneticButton>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="relative py-20 border-t border-border bg-background/60 backdrop-blur-xl z-10">
          <div className="w-full max-w-[2400px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-8">
              <RestopsLogo className="h-8 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all" />
              <p className="text-[9px] text-foreground/30 font-bold tracking-[5px] uppercase">© 2026 RESTOPS INC. BUILT FOR SCALE.</p>
              <div className="flex gap-8 text-[9px] font-bold uppercase tracking-[4px] text-foreground/30">
                  <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
                  <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Demo Request Modal */}
      <Dialog open={isDemoModalOpen} onOpenChange={setIsDemoModalOpen}>
        <DialogContent className="sm:max-w-[450px] bg-[#0a0a0f] border-border text-foreground p-0 overflow-hidden rounded-2xl">
          <div className="h-1 bg-gradient-to-r from-[#ff5c35] to-[#14c6cb] w-full" />
          <div className="p-10">
            <DialogHeader className="mb-10">
              <DialogTitle className="text-3xl font-bold tracking-tighter text-foreground">
                Request Deployment
              </DialogTitle>
              <DialogDescription className="text-muted-foreground/60 text-xs font-medium tracking-widest uppercase mt-3">
                Initialize your workspace.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleDemoSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-[10px] font-bold uppercase tracking-[2px] text-muted-foreground/60">Full Identity</Label>
                <Input id="fullName" required value={demoForm.fullName} onChange={(e) => setDemoForm({...demoForm, fullName: e.target.value})} placeholder="John Doe" className="bg-foreground/5 border-border h-12 text-foreground placeholder:text-foreground/20 focus:ring-[#ff5c35] rounded-xl text-sm transition-all" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-[2px] text-muted-foreground/60">Technical Email</Label>
                <Input id="email" type="email" required value={demoForm.email} onChange={(e) => setDemoForm({...demoForm, email: e.target.value})} placeholder="john@ops.com" className="bg-foreground/5 border-border h-12 text-foreground placeholder:text-foreground/20 focus:ring-[#ff5c35] rounded-xl text-sm transition-all" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName" className="text-[10px] font-bold uppercase tracking-[2px] text-muted-foreground/60">Enterprise Name</Label>
                <Input id="companyName" required value={demoForm.companyName} onChange={(e) => setDemoForm({...demoForm, companyName: e.target.value})} placeholder="Acme Logistics" className="bg-foreground/5 border-border h-12 text-foreground placeholder:text-foreground/20 focus:ring-[#ff5c35] rounded-xl text-sm transition-all" />
              </div>
              <DialogFooter className="pt-6">
                <Button type="submit" disabled={isSubmitting} className="w-full h-12 bg-foreground text-background hover:bg-brand hover:text-foreground font-bold text-xs tracking-[3px] rounded-xl uppercase transition-all">
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
    initial={{ opacity: 0, scale: 0.9, y: 20 }}
    whileInView={{ opacity: 1, scale: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.6 }}
    className="flex flex-col items-center md:items-start"
  >
    <div className="text-4xl md:text-5xl font-bold tracking-tighter mb-3 text-foreground">{value}</div>
    <div className="text-[9px] text-muted-foreground/60 font-bold uppercase tracking-[3px]">{label}</div>
  </motion.div>
);

const CheckItem = ({ title, desc }) => (
  <div className="space-y-1 group">
    <div className="flex items-center gap-3">
      <CheckCircle2 className="h-4 w-4 text-brand opacity-80" />
      <h4 className="font-bold text-xs tracking-[1px] uppercase text-foreground/90">{title}</h4>
    </div>
    <p className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-widest pl-7">{desc}</p>
  </div>
);

const FeatureCard = ({ icon, title, description, delay }) => (
  <motion.div 
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    className="group relative p-[1px] rounded-3xl bg-gradient-to-b from-white/10 to-transparent hover:from-[#ff5c35]/30 transition-all duration-500"
  >
    <div className="relative p-8 h-full bg-[#0a0a0f] rounded-3xl overflow-hidden">
      {/* Background radial glow on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#ff5c35]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="relative z-10">
        <div className="mb-8 text-muted-foreground group-hover:text-brand transition-colors duration-500">
          {React.cloneElement(icon, { size: 28, strokeWidth: 1.5 })}
        </div>
        <h3 className="text-lg font-bold tracking-tight mb-3 text-foreground">{title}</h3>
        <p className="text-foreground/50 text-sm leading-relaxed font-medium">
          {description}
        </p>
      </div>
    </div>
  </motion.div>
);
