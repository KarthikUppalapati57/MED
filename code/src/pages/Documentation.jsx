import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import InteractiveScene from '@/components/InteractiveScene';
import RestopsLogo from '@/components/RestopsLogo';
import { motion, useScroll, useTransform } from "framer-motion";
import Lenis from '@studio-freight/lenis';
import { 
  Database,
  ChevronLeft,
  LayoutDashboard,
  Bot,
  Package,
  FileText,
  CreditCard,
  ShoppingBag,
  ChefHat,
  Truck,
  Users,
  Calculator,
  BrainCircuit,
  MessageSquare,
  Calendar
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

export default function Documentation() {
  const navigate = useNavigate();
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [demoForm, setDemoForm] = useState({
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
      toast.success("Demo request submitted! Our team will contact you soon.");
      setIsDemoModalOpen(false);
      setDemoForm({ fullName: '', email: '', companyName: '', phone: '', plan: 'platform_unlimited' });
    } catch (err) {
      toast.error(err.message || "Failed to submit request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const modules = [
    {
      id: "dashboard",
      icon: <LayoutDashboard />,
      title: "Executive Dashboard",
      description: "Real-time command center providing top-level metrics on costs, margins, and operational alerts across the entire network."
    },
    {
      id: "autoordering",
      icon: <Bot />,
      title: "Auto-Ordering",
      description: "AI-driven procurement engine that calculates optimal order quantities based on PAR levels, historical sales, and lead times."
    },
    {
      id: "inventory",
      icon: <Package />,
      title: "Inventory & Telemetry",
      description: "High-fidelity stock tracking, variance analysis, and digital audit reconciliation with offline-first mobile support."
    },
    {
      id: "invoices",
      icon: <FileText />,
      title: "Invoice Automation",
      description: "Automated ingestion and AI-powered OCR extraction of line-item data from supplier invoices for immediate reconciliation."
    },
    {
      id: "payments",
      icon: <CreditCard />,
      title: "B2B Payments",
      description: "Integrated financial clearinghouse to manage vendor settlements, ACH transfers, and scheduled payouts securely."
    },
    {
      id: "products",
      icon: <ShoppingBag />,
      title: "Universal Catalog",
      description: "Centralized product master data management across all locations, maintaining consistent pricing and supplier linkage."
    },
    {
      id: "recipes",
      icon: <ChefHat />,
      title: "Recipe Engineering",
      description: "Dynamic sub-recipe and menu engineering tools that calculate real-time theoretical plate costs as ingredient prices fluctuate."
    },
    {
      id: "vendors",
      icon: <Truck />,
      title: "Vendor Management",
      description: "Comprehensive CRM for supplier relations, delivery scheduling, order history tracking, and dispute resolution."
    },
    {
      id: "labor",
      icon: <Users />,
      title: "Labor Logistics",
      description: "Workforce orchestration, scheduling compliance, and labor cost analysis against projected sales volume."
    },
    {
      id: "accounting",
      icon: <Calculator />,
      title: "Financial Sync",
      description: "Automated chart of accounts mapping and general ledger synchronization, seamlessly bridging ops and accounting."
    },
    {
      id: "ai-insights",
      icon: <BrainCircuit />,
      title: "AI Insights",
      description: "Machine learning models delivering predictive analytics, cost anomaly detection, and operational optimization suggestions."
    }
  ];

  return (
    <div className="min-h-screen bg-[#fdf8f1] text-black selection:bg-[#ff5c35]/30 font-sans antialiased overflow-x-hidden selection:text-white">
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
      <nav className="fixed top-0 w-full z-50 border-b border-black/5 bg-[#fdf8f1]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="h-6 w-6 rounded-sm bg-black group-hover:bg-[#ff5c35] transition-colors flex items-center justify-center">
                <ChevronLeft className="h-4 w-4 text-white" />
              </div>
              <span className="text-xs font-bold tracking-widest uppercase text-black/60 group-hover:text-black transition-colors hidden md:block">
                Back to Platform
              </span>
            </Link>
            
            <div className="flex items-center">
              <RestopsLogo className="h-6" showText={false} />
              <span className="text-sm font-bold tracking-widest uppercase ml-3">
                Architecture Docs
              </span>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-48 pb-32 overflow-hidden z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-flex items-center justify-center gap-2 px-3 py-1 rounded-sm bg-black text-[10px] font-bold tracking-[4px] uppercase text-white mb-12">
              Platform Overview
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold technical-tracking text-black mb-8 leading-tight">
              Sovereign infrastructure for <br className="hidden md:block"/> high-performance logistics.
            </h1>
            
            <p className="max-w-2xl mx-auto text-lg md:text-xl text-black/60 leading-relaxed font-medium technical-tracking">
              Restops is an end-to-end enterprise platform designed to automate physical supply chains, digitize financial audits, and orchestrate complex multi-unit operations through localized intelligence.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Modules Section */}
      <section className="relative py-24 border-t border-black/5 z-10 bg-[#fdf8f1]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-20 text-center">
            <h2 className="text-3xl font-bold tracking-tighter mb-4 text-black uppercase">Core Modules</h2>
            <div className="h-0.5 w-16 bg-[#ff5c35] mx-auto" />
            <p className="mt-6 text-black/50 text-sm font-bold tracking-widest uppercase max-w-xl mx-auto">
              A comprehensive suite of interconnected systems designed to scale with your operation.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-y-24 gap-x-12">
            {modules.map((mod, i) => (
              <motion.div 
                key={mod.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: (i % 3) * 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="group relative"
              >
                <div className="mb-8 text-black group-hover:text-[#ff5c35] transition-colors duration-500">
                  {React.cloneElement(mod.icon, { size: 36, strokeWidth: 1.5 })}
                </div>
                <h3 className="text-lg font-bold tracking-tighter mb-3 uppercase text-black">{mod.title}</h3>
                <p className="text-black/50 text-sm leading-relaxed font-medium technical-tracking">
                  {mod.description}
                </p>
                <div className="mt-8 opacity-0 group-hover:opacity-100 transition-all duration-700">
                  <div className="h-[2px] w-12 bg-black" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section & Footer */}
      <footer className="relative py-32 border-t border-black/5 bg-[#fdf8f1] z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold tracking-tighter mb-8 text-black">Ready to deploy?</h2>
          <p className="text-black/50 text-lg mb-12 font-medium technical-tracking max-w-xl mx-auto">
            Schedule a technical walkthrough with our engineering team to map out your infrastructure integration.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-32">
            <Button size="lg" className="h-14 px-12 bg-black text-white hover:bg-[#ff5c35] font-bold text-xs tracking-[4px] rounded-sm transition-all shadow-xl uppercase" onClick={() => setIsDemoModalOpen(true)}>
              <Calendar className="mr-3 h-4 w-4" /> BOOK A DEMO
            </Button>
            <a href="mailto:support@restops.com">
              <Button size="lg" variant="outline" className="h-14 px-12 border-2 border-black text-black hover:bg-black hover:text-white font-bold text-xs tracking-[4px] rounded-sm transition-all uppercase bg-transparent">
                <MessageSquare className="mr-3 h-4 w-4" /> CONTACT SUPPORT
              </Button>
            </a>
          </div>

          <div className="pt-12 border-t border-black/5 flex flex-col md:flex-row justify-between items-center gap-6">
            <Link to="/" className="text-[10px] font-bold uppercase tracking-[4px] text-black/40 hover:text-black transition-colors flex items-center">
              <ChevronLeft className="h-3 w-3 mr-1" /> RETURN TO HOME
            </Link>
            <p className="text-[9px] text-black/30 font-bold tracking-[5px] uppercase">
              © 2026 RESTOPS INC. ARCHITECTURE DOCS.
            </p>
          </div>
        </div>
      </footer>

      {/* Demo Request Modal (Shared Logic) */}
      <Dialog open={isDemoModalOpen} onOpenChange={setIsDemoModalOpen}>
        <DialogContent className="sm:max-w-[450px] bg-white border-black/10 text-black p-0 overflow-hidden rounded-sm">
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
                <Input id="fullName" required value={demoForm.fullName} onChange={(e) => setDemoForm({...demoForm, fullName: e.target.value})} placeholder="JOHN DOE" className="bg-slate-50 border-black/5 h-12 text-black placeholder:text-black/10 focus:ring-[#ff5c35] rounded-none uppercase text-xs font-bold" />
              </div>
              <div className="space-y-3">
                <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-[4px] text-black/20">Technical Email</Label>
                <Input id="email" type="email" required value={demoForm.email} onChange={(e) => setDemoForm({...demoForm, email: e.target.value})} placeholder="JOHN@OPS.COM" className="bg-slate-50 border-black/5 h-12 text-black placeholder:text-black/10 focus:ring-[#ff5c35] rounded-none uppercase text-xs font-bold" />
              </div>
              <div className="space-y-3">
                <Label htmlFor="companyName" className="text-[10px] font-bold uppercase tracking-[4px] text-black/20">Enterprise Name</Label>
                <Input id="companyName" required value={demoForm.companyName} onChange={(e) => setDemoForm({...demoForm, companyName: e.target.value})} placeholder="ACME LOGISTICS" className="bg-slate-50 border-black/5 h-12 text-black placeholder:text-black/10 focus:ring-[#ff5c35] rounded-none uppercase text-xs font-bold" />
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
