import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Landmark, CheckCircle } from 'lucide-react';

export default function VendorOnboardingBank() {
  const { token } = useParams();
  const [bankDetails, setBankDetails] = useState({
    accountName: '',
    routingNumber: '',
    accountNumber: '',
    accountType: 'checking'
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!bankDetails.routingNumber || !bankDetails.accountNumber) {
      return toast.error("Please provide both Routing and Account numbers.");
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('vendor-onboarding', {
        body: {
          action: 'submit-bank-info',
          payload: {
            token,
            bank_details: bankDetails
          }
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSuccess(true);
      toast.success("Bank details submitted securely!");
    } catch (err) {
      toast.error(err.message || "Failed to submit bank information. Your link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-secondary p-6 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto bg-green-100 p-3 rounded-full w-16 h-16 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle>Bank Details Submitted</CardTitle>
            <CardDescription>
              Your banking information has been securely received. Payments remain locked until our team confirms the change by phone using the contact already on file.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary p-6 flex items-center justify-center">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-primary" />
            Secure Banking Information
          </CardTitle>
          <CardDescription>
            Please provide your bank account details for ACH payments. Payments stay locked until callback verification is complete.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label>Account Holder Name *</Label>
              <Input 
                value={bankDetails.accountName} 
                onChange={e => setBankDetails({...bankDetails, accountName: e.target.value})} 
                placeholder="Acme Corp" 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label>Routing Number *</Label>
              <Input 
                value={bankDetails.routingNumber} 
                onChange={e => setBankDetails({...bankDetails, routingNumber: e.target.value})} 
                placeholder="123456789" 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label>Account Number *</Label>
              <Input 
                value={bankDetails.accountNumber} 
                onChange={e => setBankDetails({...bankDetails, accountNumber: e.target.value})} 
                type="password" 
                placeholder="************" 
                required 
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Submit Securely
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
