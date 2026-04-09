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
  FileText, 
  Layers,
  CheckCircle2,
  Clock,
  Sparkles,
  Loader2
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
    <div className="min-h-screen bg-slate-950 text-white selection:bg-teal-500/30">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-slate-950/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-teal-500 flex items-center justify-center">
                <Layers className="h-5 w-5 text-slate-950" />
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                EdgeOps
              </span>
            </div>
            
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#showcase" className="hover:text-white transition-colors">Showcase</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
              <Button 
                variant="ghost" 
                className="text-slate-400 hover:text-white hover:bg-white/5"
                onClick={() => navigate('/login')}
              >
                Log in
              </Button>
              <Button 
                className="bg-teal-500 text-slate-950 hover:bg-teal-400 font-semibold"
                onClick={() => setIsDemoModalOpen(true)}
              >
                Request Demo
              </Button>
            </div>

            <div className="md:hidden">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-slate-400">
                {isMenuOpen ? <X /> : <Menu />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-slate-900 border-b border-white/5 p-4 space-y-4">
            <a href="#features" className="block text-slate-400 hover:text-white">Features</a>
            <a href="#showcase" className="block text-slate-400 hover:text-white">Showcase</a>
            <a href="#pricing" className="block text-slate-400 hover:text-white">Pricing</a>
            <hr className="border-white/5" />
            <Button variant="ghost" className="w-full justify-start text-slate-400 px-0" onClick={() => navigate('/login')}>Log in</Button>
            <Button className="w-full bg-teal-500 text-slate-950 hover:bg-teal-400" onClick={() => navigate('/login?mode=signup')}>Get Started</Button>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] opacity-20 pointer-events-none">
          <div className="absolute inset-x-0 top-0 h-full bg-teal-500/30 blur-[120px] rounded-full" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-teal-400 mb-8">
            <Sparkles className="h-3 w-3" />
            AI-Powered Operational Excellence
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-500">
            Automate your kitchen <br className="hidden md:block" /> with intelligence.
          </h1>
          
          <p className="max-w-2xl mx-auto text-lg md:text-xl text-slate-400 mb-10 leading-relaxed">
            EdgeOps transforms how restaurants handle data. Automate invoice processing, 
            track inventory in real-time, and optimize your ordering cycles—all in one place.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <Button size="lg" className="h-12 px-8 bg-teal-500 text-slate-950 hover:bg-teal-400 font-bold text-base transition-all hover:scale-105" onClick={() => setIsDemoModalOpen(true)}>
              Request Demo <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-8 border-white/10 bg-white/5 hover:bg-white/10 text-white font-medium" onClick={() => document.getElementById('features').scrollIntoView({behavior: 'smooth'})}>
              Explore Platform
            </Button>
          </div>

          {/* Interactive Interface Preview */}
          <div className="relative max-w-5xl mx-auto group">
            <div className="absolute -inset-1 bg-gradient-to-r from-teal-500 to-emerald-500 rounded-[2.5rem] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative rounded-[2rem] border border-white/10 overflow-hidden bg-slate-900 shadow-2xl">
              <img src={dashboardImg} alt="Dashboard Preview" className="w-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-y border-white/5 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold mb-1">99%</div>
              <div className="text-sm text-slate-500 uppercase tracking-wider">Accuracy</div>
            </div>
            <div>
              <div className="text-3xl font-bold mb-1">10k+</div>
              <div className="text-sm text-slate-500 uppercase tracking-wider">Invoices Processed</div>
            </div>
            <div>
              <div className="text-3xl font-bold mb-1">20h</div>
              <div className="text-sm text-slate-500 uppercase tracking-wider">Weekly Time Saved</div>
            </div>
            <div>
              <div className="text-3xl font-bold mb-1">24/7</div>
              <div className="text-sm text-slate-500 uppercase tracking-wider">Support</div>
            </div>
          </div>
        </div>
      </section>

      {/* Showcase Section */}
      <section id="showcase" className="py-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="flex-1 space-y-8">
              <div className="inline-flex items-center gap-2 text-teal-400 font-semibold text-sm">
                <CheckCircle2 className="h-4 w-4" />
                Mobile First Workflow
              </div>
              <h2 className="text-4xl font-bold leading-tight">
                Scan on the go. <br /> Sync everywhere.
              </h2>
              <p className="text-slate-400 text-lg">
                Our AI-driven mobile interface allows you to capture invoices and inventory sheets directly from the kitchen floor. 
                Everything syncs instantly to your central dashboard.
              </p>
              <ul className="space-y-4">
                <li className="flex items-center gap-3 text-slate-300">
                  <div className="h-2 w-2 rounded-full bg-teal-500" />
                  Instant OCR extraction for items & pricing
                </li>
                <li className="flex items-center gap-3 text-slate-300">
                  <div className="h-2 w-2 rounded-full bg-teal-500" />
                  Offline mode for weak kitchen signals
                </li>
                <li className="flex items-center gap-3 text-slate-300">
                  <div className="h-2 w-2 rounded-full bg-teal-500" />
                  Batch processing for high-volume days
                </li>
              </ul>
            </div>
            <div className="flex-1 relative">
                <div className="absolute inset-0 bg-teal-500/20 blur-[80px] rounded-full pointer-events-none" />
                <img src={scannerImg} alt="Mobile Scanner" className="relative z-10 w-full max-w-sm mx-auto shadow-2xl rounded-[3rem] border-8 border-slate-800" />
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 border-t border-white/5 bg-slate-900/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Powerful from day one</h2>
            <p className="text-slate-400 max-w-xl mx-auto">Everything you need to run a data-driven kitchen without the manual spreadsheet hell.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Zap className="h-6 w-6 text-teal-400" />}
              title="Automated Extraction"
              description="Upload invoices and let our AI extract items, prices, and tax automatically. Integrated directly with your accounting."
            />
            <FeatureCard 
              icon={<BarChart3 className="h-6 w-6 text-teal-400" />}
              title="Real-time Inventory"
              description="Keep track of stock levels across multiple locations. Get alerts when supplies are running low."
            />
            <FeatureCard 
              icon={<ShieldCheck className="h-6 w-6 text-teal-400" />}
              title="Secure Payments"
              description="Pay vendors directly through the platform with enterprise-grade security and automated reconciliation."
            />
            <FeatureCard 
              icon={<Clock className="h-6 w-6 text-teal-400" />}
              title="Auto-Ordering"
              description="Set par levels and let EdgeOps suggest or place orders automatically based on historical data."
            />
            <FeatureCard 
              icon={<Layers className="h-6 w-6 text-teal-400" />}
              title="Multi-unit Management"
              description="Manage multiple restaurants or ghost kitchens from a single unified administrator interface."
            />
            <FeatureCard 
              icon={<Sparkles className="h-6 w-6 text-teal-400" />}
              title="Insightful Analytics"
              description="Visualize food cost trends, ingredient price fluctuations, and vendor performance over time."
            />
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Simple, transparent pricing</h2>
            <p className="text-slate-400">Scale with your business. No hidden fees.</p>
          </div>

          <div className="max-w-md mx-auto p-8 rounded-3xl bg-slate-900 border border-teal-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4">
              <span className="bg-teal-500 text-slate-950 text-xs font-bold px-2 py-1 rounded-full uppercase tracking-widest">Early Access</span>
            </div>
            <div className="mb-8">
              <h3 className="text-2xl font-bold mb-2">Platform Unlimited</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">$149</span>
                <span className="text-slate-500">/mo</span>
              </div>
            </div>
            <ul className="space-y-4 mb-8">
              {[
                "Unlimited invoice processing",
                "Unlimited users",
                "All modules included",
                "Custom vendor integrations",
                "Priority 24/7 support"
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-slate-300 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-teal-500" />
                  {item}
                </li>
              ))}
            </ul>
            <Button className="w-full h-12 bg-teal-500 text-slate-950 hover:bg-teal-400 font-bold" onClick={() => setIsDemoModalOpen(true)}>
              Join Waitlist / Request Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-teal-500/10 to-transparent opacity-50" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative text-center">
              <h2 className="text-4xl md:text-5xl font-bold mb-8">Ready to reclaim your time?</h2>
              <p className="text-slate-400 text-lg mb-10">Join forward-thinking restaurants already using EdgeOps to automate their backend.</p>
              <Button size="lg" className="h-14 px-10 bg-teal-500 text-slate-950 hover:bg-teal-400 font-bold text-lg" onClick={() => navigate('/login?mode=signup')}>
                  Start Your 14-Day Free Trial
              </Button>
          </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/5 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-8">
            <div className="flex items-center gap-2 opacity-80">
              <Layers className="h-5 w-5 text-teal-500" />
              <span className="text-xl font-bold">EdgeOps</span>
            </div>
            <div className="flex gap-8 text-sm text-slate-500">
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#showcase" className="hover:text-white transition-colors">Showcase</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            </div>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/5 gap-4">
            <p className="text-sm text-slate-600">© 2026 EdgeOps. All rights reserved.</p>
            <div className="flex gap-6 text-sm text-slate-500">
                <a href="#" className="hover:text-white transition-colors">Privacy</a>
                <a href="#" className="hover:text-white transition-colors">Terms</a>
                <a href="#" className="hover:text-white transition-colors">Status</a>
            </div>
          </div>
        </div>
      </footer>
      {/* Demo Request Modal */}
      <Dialog open={isDemoModalOpen} onOpenChange={setIsDemoModalOpen}>
        <DialogContent className="sm:max-w-[425px] bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-emerald-400">
              Request a Demo
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Fill out the form below and our team will get back to you with a custom walkthrough of the platform.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDemoSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-sm font-medium text-slate-300">Full Name</Label>
              <Input 
                id="fullName" 
                required 
                value={demoForm.fullName}
                onChange={(e) => setDemoForm({...demoForm, fullName: e.target.value})}
                placeholder="John Doe" 
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:ring-teal-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-slate-300">Business Email</Label>
              <Input 
                id="email" 
                type="email" 
                required 
                value={demoForm.email}
                onChange={(e) => setDemoForm({...demoForm, email: e.target.value})}
                placeholder="john@restaurant.com" 
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:ring-teal-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-sm font-medium text-slate-300">Company Name</Label>
              <Input 
                id="companyName" 
                required 
                value={demoForm.companyName}
                onChange={(e) => setDemoForm({...demoForm, companyName: e.target.value})}
                placeholder="Acme Hospitality" 
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:ring-teal-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-medium text-slate-300">Phone Number</Label>
              <Input 
                id="phone" 
                type="tel" 
                value={demoForm.phone}
                onChange={(e) => setDemoForm({...demoForm, phone: e.target.value})}
                placeholder="+1 (555) 000-0000" 
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:ring-teal-500"
              />
            </div>
            <DialogFooter className="pt-4">
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full bg-teal-500 text-slate-950 hover:bg-teal-400 font-bold py-6 text-lg"
              >
                {isSubmitting ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Submitting...</>
                ) : "Submit Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const FeatureCard = ({ icon, title, description }) => (
  <div className="p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-teal-500/30 transition-all group">
    <div className="h-12 w-12 rounded-xl bg-teal-500/10 flex items-center justify-center mb-6 group-hover:bg-teal-500/20 transition-colors">
      {icon}
    </div>
    <h3 className="text-xl font-semibold mb-3">{title}</h3>
    <p className="text-slate-400 leading-relaxed text-sm">
      {description}
    </p>
  </div>
);
    </div>
  );
}
