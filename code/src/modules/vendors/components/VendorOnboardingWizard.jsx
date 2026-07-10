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
import { toast } from "sonner";
import { Loader2, CheckCircle2, Send, ShieldCheck, Mail } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export default function VendorOnboardingWizard({ open, onOpenChange }) {
  const { organization, brand, location } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [vendorId, setVendorId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [devOtp, setDevOtp] = useState(null); // To display for dev

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    contact_name: ''
  });
  
  const [otpInput, setOtpInput] = useState('');
  
  const [paymentSettings, setPaymentSettings] = useState({
    default_payment_method: 'stripe',
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
      // 1. Create Vendor
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

      // 2. Request OTP
      const { data, error } = await supabase.functions.invoke('vendor-onboarding', {
        body: { action: 'send-otp', payload: { vendor_id: newVendor.id } }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setDevOtp(data.devOtp); // For developer use
      toast.success("OTP sent successfully to vendor!");
      setStep(1.5); // Move to OTP verification sub-step
    } catch (err) {
      toast.error(err.message || "Failed to initiate onboarding");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpInput) return toast.error("Please enter the OTP");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('vendor-onboarding', {
        body: { action: 'verify-otp', payload: { vendor_id: vendorId, otp: otpInput } }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("OTP verified!");
      setStep(2);
    } catch (err) {
      toast.error(err.message || "Invalid OTP");
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

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Magic link for ${type === 'tax' ? 'Tax info' : 'Bank details'} sent to vendor!`);
      // Simulating moving to next step. In reality, the tenant waits for the vendor.
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Vendor Onboarding Wizard</DialogTitle>
          <DialogDescription>
            Step-by-step process to securely onboard a new vendor.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* STEP 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2"><Mail className="w-5 h-5"/> Step 1: Basic Details</h3>
              <p className="text-sm text-muted-foreground">Enter vendor details to begin verification.</p>
              <div className="grid gap-3">
                <div>
                  <Label>Vendor Name *</Label>
                  <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Acme Corp" />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="billing@acmecorp.com" type="email" />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="+1 555-0123" />
                </div>
                <div>
                  <Label>Contact Name</Label>
                  <Input value={formData.contact_name} onChange={e => setFormData({...formData, contact_name: e.target.value})} placeholder="John Doe" />
                </div>
              </div>
            </div>
          )}

          {/* STEP 1.5: OTP Verification */}
          {step === 1.5 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2"><ShieldCheck className="w-5 h-5"/> Verify Vendor</h3>
              <p className="text-sm text-muted-foreground">An OTP has been sent to {formData.email || formData.phone}.</p>
              
              <div>
                <Label>Enter OTP</Label>
                <Input value={otpInput} onChange={e => setOtpInput(e.target.value)} placeholder="123456" className="text-xl tracking-widest text-center h-12" maxLength={6}/>
              </div>
            </div>
          )}

          {/* STEP 2: Tax Info Magic Link */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Step 2: Secure Tax Information (W9 / SSN / EIN)</h3>
              <p className="text-sm text-muted-foreground">
                We need to collect the vendor's Tax ID and W9 document securely. Send them a magic link so they can upload it directly.
              </p>
              <div className="p-4 border rounded-md bg-muted/30 text-center space-y-3">
                <Button onClick={() => handleSendMagicLink('tax')} disabled={loading}>
                  <Send className="w-4 h-4 mr-2" /> Send Tax Info Magic Link
                </Button>
                <p className="text-xs text-muted-foreground">The vendor will receive an email with a secure, 24-hour link.</p>
              </div>
            </div>
          )}

          {/* STEP 3: Bank Details Magic Link */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Step 3: Secure Bank Details</h3>
              <p className="text-sm text-muted-foreground">
                Now that tax info is pending/completed, send another magic link for the vendor to securely enter their bank account details.
              </p>
              <div className="p-4 border rounded-md bg-muted/30 text-center space-y-3">
                <Button onClick={() => handleSendMagicLink('bank')} disabled={loading}>
                  <Send className="w-4 h-4 mr-2" /> Send Banking Magic Link
                </Button>
                <p className="text-xs text-muted-foreground">This separates tax collection from banking collection for added security.</p>
              </div>
            </div>
          )}

          {/* STEP 4: Payment Settings */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-resend-green" /> Step 4: Finalize Configuration</h3>
              <p className="text-sm text-muted-foreground">
                Set up default payment preferences for this vendor.
              </p>
              <div className="grid gap-4 mt-4 p-4 border rounded-md bg-white">
                <div className="space-y-2">
                  <Label>Default Payment Method</Label>
                  <Select value={paymentSettings.default_payment_method} onValueChange={v => setPaymentSettings({...paymentSettings, default_payment_method: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stripe">Stripe (ACH)</SelectItem>
                      <SelectItem value="paypal">PayPal</SelectItem>
                      <SelectItem value="dwolla">Dwolla</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable AutoPay</Label>
                    <p className="text-xs text-muted-foreground">Automatically pay approved invoices.</p>
                  </div>
                  <Switch checked={paymentSettings.autopay_enabled} onCheckedChange={c => setPaymentSettings({...paymentSettings, autopay_enabled: c})} />
                </div>
              </div>
            </div>
          )}

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          
          {step === 1 && (
            <Button onClick={handleCreateVendorAndSendOtp} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Continue
            </Button>
          )}
          
          {step === 1.5 && (
            <Button onClick={handleVerifyOtp} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Verify OTP
            </Button>
          )}

          {(step === 2 || step === 3) && (
            <Button variant="ghost" onClick={() => setStep(step + 1)}>
              Skip for now
            </Button>
          )}

          {step === 4 && (
            <Button onClick={handleFinalize} disabled={loading} className="bg-resend-green hover:bg-resend-green/90 text-white">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Complete Onboarding
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
