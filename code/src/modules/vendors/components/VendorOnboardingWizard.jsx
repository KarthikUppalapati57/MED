import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from "sonner";
import { Loader2, CheckCircle2, Send, ShieldCheck, Mail, Building2, CreditCard } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
const formatUSPhoneInput = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const normalizeOtpInput = (value) => value.replace(/\D/g, '').slice(0, 6);

export default function VendorOnboardingWizard({ open, onOpenChange }) {
  const { organization, brand, location } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [vendorId, setVendorId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [devOtp, setDevOtp] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    contact_name: ''
  });
  
  const [otpInput, setOtpInput] = useState('');
  
  const [paymentSettings, setPaymentSettings] = useState({
    default_payment_method: 'check',
    autopay_enabled: false
  });

  const resetForm = () => {
    setStep(1);
    setVendorId(null);
    setDevOtp(null);
    setFormData({ name: '', email: '', phone: '', contact_name: '' });
    setOtpInput('');
    setPaymentSettings({ default_payment_method: 'stripe', autopay_enabled: false });
  };

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  const handleCreateVendorAndSendOtp = async () => {
    if (!formData.name || !formData.email) {
      return toast.error("Name and Email are required");
    }
    setLoading(true);
    try {
      const newVendor = await api.entities.Vendor.create({
        organization_id: organization?.id,
        brand_id: brand?.id || null,
        location_id: location?.id || null,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        contact_name: formData.contact_name,
        onboarding_status: 'pending_otp'
      });
      setVendorId(newVendor.id);

      const { data, error } = await supabase.functions.invoke('vendor-onboarding', {
        body: { action: 'send-otp', payload: { vendor_id: newVendor.id } }
      });

      if (data?.error) throw new Error(data.error);
      if (error) throw error;

      setDevOtp(data.devOtp);
      toast.success("OTP sent successfully to vendor!");
      setStep(1.5);
    } catch (err) {
      toast.error(err.message || "Failed to initiate onboarding");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const normalizedOtp = normalizeOtpInput(otpInput);
    if (normalizedOtp.length !== 6) return toast.error("Enter the 6-digit OTP");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('vendor-onboarding', {
        body: { action: 'verify-otp', payload: { vendor_id: vendorId, otp: normalizedOtp } }
      });

      if (data?.error) throw new Error(data.error);
      if (error) throw error;

      toast.success("OTP verified!");
      setOtpInput('');
      setStep(2);
    } catch (err) {
      toast.error(err.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!vendorId) return toast.error("Start vendor onboarding before resending an OTP");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('vendor-onboarding', {
        body: { action: 'send-otp', payload: { vendor_id: vendorId } }
      });

      if (data?.error) throw new Error(data.error);
      if (error) throw error;

      setOtpInput('');
      setDevOtp(data?.devOtp || null);
      toast.success("A new OTP was sent to the vendor");
    } catch (err) {
      toast.error(err.message || "Failed to resend OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleSendMagicLink = async (type) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('vendor-onboarding', {
        body: { action: 'send-magic-link', payload: { vendor_id: vendorId, type } }
      });

      if (data?.error) throw new Error(data.error);
      if (error) throw error;

      toast.success(`Magic link for ${type === 'tax' ? 'Tax info' : 'Bank details'} sent to vendor!`);
      if (type === 'tax') setStep(3);
      if (type === 'bank') setStep(4);
      
      console.log(`[DEV URL for ${type}]: `, data.magicLinkUrl);
    } catch (err) {
      toast.error(err.message || "Failed to send magic link");
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    setLoading(true);
    try {
      await api.entities.Vendor.update(vendorId, {
        default_payment_method: paymentSettings.default_payment_method,
        autopay_enabled: paymentSettings.autopay_enabled,
        onboarding_status: 'completed'
      });
      toast.success("Vendor onboarding complete!");
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message || "Failed to save payment settings");
    } finally {
      setLoading(false);
    }
  };

  // Helper to map our logic state to a visual stepper
  const getVisualStepIndex = () => {
    if (step === 1) return 1;
    if (step === 1.5) return 2;
    if (step === 2 || step === 3) return 3;
    if (step === 4) return 4;
    return 1;
  };

  const visualStep = getVisualStepIndex();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl h-[85vh] p-0 overflow-hidden flex flex-col bg-secondary/30">
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <div className="mx-auto w-full max-w-4xl">
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-primary mb-1">Vendor Onboarding</p>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Add a new vendor</h1>
              </div>
              <div className="text-sm text-muted-foreground">
                <ShieldCheck className="inline-block w-4 h-4 mr-1 mb-0.5" /> Secure Workflow
              </div>
            </div>

            {/* Stepper */}
            <div className="mb-8 grid gap-2 sm:grid-cols-4">
              {['Basic Details', 'Verification', 'Information', 'Payment Setup'].map((label, index) => {
                const itemStep = index + 1;
                const active = visualStep === itemStep;
                const done = visualStep > itemStep;
                return (
                  <div key={label} className={`rounded-md border px-4 py-3 text-sm transition-colors ${active ? 'border-primary bg-primary/10 text-primary shadow-sm' : done ? 'border-primary/30 bg-primary/5 text-foreground' : 'bg-card text-muted-foreground'}`}>
                    <div className="flex items-center gap-2 font-medium">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${active || done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : itemStep}
                      </span>
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>

            <Card className="border-border bg-card shadow-sm">
              {step === 1 && (
                <>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-primary"/> Basic Details</CardTitle>
                    <CardDescription>Enter the vendor's primary contact information to begin the onboarding process.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="vendor-name" className="text-sm font-medium">Vendor Name <span className="text-destructive">*</span></Label>
                        <Input id="vendor-name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Acme Corp" className="h-11 bg-muted/20" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="vendor-email" className="text-sm font-medium">Email <span className="text-destructive">*</span></Label>
                        <Input id="vendor-email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="billing@acmecorp.com" type="email" className="h-11 bg-muted/20" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="vendor-phone" className="text-sm font-medium">Phone</Label>
                        <Input id="vendor-phone" value={formData.phone} onChange={e => setFormData({...formData, phone: formatUSPhoneInput(e.target.value)})} placeholder="(555) 010-0000" className="h-11 bg-muted/20" inputMode="tel" />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="vendor-contact" className="text-sm font-medium">Primary Contact Name</Label>
                        <Input id="vendor-contact" value={formData.contact_name} onChange={e => setFormData({...formData, contact_name: e.target.value})} placeholder="John Doe" className="h-11 bg-muted/20" />
                      </div>
                    </div>
                  </CardContent>
                </>
              )}

              {step === 1.5 && (
                <>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary"/> Verify Vendor Identity</CardTitle>
                    <CardDescription>To ensure security, we've sent a One-Time Password (OTP) to {formData.email}.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="max-w-sm mx-auto my-8 space-y-4 text-center">
                      <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Mail className="w-8 h-8 text-primary" />
                      </div>
                      <Label className="text-base">Enter the 6-digit code</Label>
                      <Input 
                        value={otpInput} 
                        onChange={e => setOtpInput(normalizeOtpInput(e.target.value))} 
                        placeholder="000000" 
                        className="text-3xl tracking-[0.7em] text-center h-16 font-mono bg-muted/20 placeholder:tracking-normal" 
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                      />
                      {devOtp && (
                        <p className="text-xs text-muted-foreground mt-4">Developer Note: The OTP is <strong>{devOtp}</strong></p>
                      )}
                      <Button type="button" variant="ghost" size="sm" onClick={handleResendOtp} disabled={loading}>
                        Resend OTP
                      </Button>
                    </div>
                  </CardContent>
                </>
              )}

              {step === 2 && (
                <>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-primary"/> Tax Information Collection</CardTitle>
                    <CardDescription>Request secure tax information (W9 / SSN / EIN) directly from the vendor.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 text-center space-y-4 my-4">
                      <div className="bg-background w-12 h-12 rounded-full flex items-center justify-center mx-auto border shadow-sm">
                        <Send className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground">Send Secure Magic Link</h3>
                      <p className="text-sm text-muted-foreground max-w-md mx-auto">
                        The vendor will receive an email with a secure, 24-hour link to upload their tax documents. This keeps sensitive data out of your inbox.
                      </p>
                      <div className="pt-4">
                        <Button onClick={() => handleSendMagicLink('tax')} disabled={loading} size="lg" className="w-full sm:w-auto">
                          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                          Send Tax Info Request
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </>
              )}

              {step === 3 && (
                <>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5 text-primary"/> Bank Details Collection</CardTitle>
                    <CardDescription>Request secure banking details for invoice payouts.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                     <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 text-center space-y-4 my-4">
                      <div className="bg-background w-12 h-12 rounded-full flex items-center justify-center mx-auto border shadow-sm">
                        <Building2 className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground">Send Banking Magic Link</h3>
                      <p className="text-sm text-muted-foreground max-w-md mx-auto">
                        Now that the tax info request is sent, send a separate magic link for the vendor to securely enter their bank account details.
                      </p>
                      <div className="pt-4">
                        <Button onClick={() => handleSendMagicLink('bank')} disabled={loading} size="lg" className="w-full sm:w-auto">
                          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                          Send Banking Request
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </>
              )}

              {step === 4 && (
                <>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-resend-green" /> Finalize Configuration</CardTitle>
                    <CardDescription>Set up default payment preferences while you wait for the vendor to submit their information.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-6 mt-2 p-6 border rounded-lg bg-muted/10">
                      <div className="space-y-3">
                        <Label className="text-base font-medium">Default Payment Method</Label>
                        <Select value={paymentSettings.default_payment_method} onValueChange={v => setPaymentSettings({...paymentSettings, default_payment_method: v})}>
                          <SelectTrigger className="h-11 bg-card w-full max-w-md">
                            <SelectValue placeholder="Select a payment method" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="stripe">Stripe (Card)</SelectItem>
                            <SelectItem value="dwolla">Dwolla (ACH)</SelectItem>
                            <SelectItem value="check">Check (Checkbook.io)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="h-px bg-border my-2"></div>
                      
                      <div className="flex items-center justify-between max-w-md">
                        <div className="pr-4">
                          <Label className="text-base font-medium">Enable AutoPay</Label>
                          <p className="text-sm text-muted-foreground mt-1">Automatically pay approved invoices from this vendor using the default method.</p>
                        </div>
                        <Switch 
                          checked={paymentSettings.autopay_enabled} 
                          onCheckedChange={c => setPaymentSettings({...paymentSettings, autopay_enabled: c})} 
                        />
                      </div>
                    </div>
                  </CardContent>
                </>
              )}
            </Card>
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="border-t bg-background p-4 sm:px-10 flex items-center justify-end gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading} className="text-muted-foreground">
            Cancel
          </Button>
          
          {step === 1 && (
            <Button onClick={handleCreateVendorAndSendOtp} disabled={loading} size="lg" className="min-w-[140px]">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Save & Continue
            </Button>
          )}
          
          {step === 1.5 && (
            <Button onClick={handleVerifyOtp} disabled={loading} size="lg" className="min-w-[140px]">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Verify OTP
            </Button>
          )}

          {(step === 2 || step === 3) && (
            <Button variant="outline" onClick={() => setStep(step + 1)} className="min-w-[140px]" size="lg">
              Skip for now
            </Button>
          )}

          {step === 4 && (
            <Button onClick={handleFinalize} disabled={loading} size="lg" className="min-w-[180px] bg-primary hover:bg-primary/90">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />} 
              Save & Complete
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
