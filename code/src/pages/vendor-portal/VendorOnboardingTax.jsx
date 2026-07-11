import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ShieldCheck, UploadCloud } from 'lucide-react';

export default function VendorOnboardingTax() {
  const { token } = useParams();
  const [taxId, setTaxId] = useState('');
  const [w9File, setW9File] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setW9File(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!taxId || !w9File) {
      return toast.error("Please provide both Tax ID and a W9 document.");
    }

    setLoading(true);
    try {
      // 1. Upload W9
      const fileExt = w9File.name.split('.').pop();
      const fileName = `${token}_${Date.now()}.${fileExt}`;
      const filePath = `w9_documents/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('vendor_documents')
        .upload(filePath, w9File);
        
      if (uploadError) {
        // Create bucket if it doesn't exist, though typically done in migrations
        // We'll throw to let catch handle it.
        throw uploadError;
      }

      // 2. Submit to edge function
      const { data, error } = await supabase.functions.invoke('vendor-onboarding', {
        body: {
          action: 'submit-tax-info',
          payload: {
            token,
            tax_id: taxId,
            w9_document_path: filePath
          }
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSuccess(true);
      toast.success("Information submitted securely!");
    } catch (err) {
      toast.error(err.message || "Failed to submit tax information. Your link may have expired.");
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
              <ShieldCheck className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle>Successfully Submitted</CardTitle>
            <CardDescription>
              Your tax information and W9 document have been securely received for review. You can now close this window.
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
            <ShieldCheck className="w-5 h-5 text-primary" />
            Secure Tax Information
          </CardTitle>
          <CardDescription>
            Please provide your Tax ID (SSN/EIN) and upload your W9 document. This information is stored securely and reviewed before banking is unlocked.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label>Tax ID (SSN or EIN) *</Label>
              <Input 
                value={taxId} 
                onChange={e => setTaxId(e.target.value)} 
                placeholder="000-00-0000 or 00-0000000" 
                type="text" 
                required 
              />
            </div>

            <div className="space-y-2">
              <Label>W9 Document (PDF) *</Label>
              <div className="border-2 border-dashed rounded-md p-6 text-center hover:bg-muted/50 transition cursor-pointer" onClick={() => document.getElementById('w9-upload').click()}>
                <UploadCloud className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">{w9File ? w9File.name : "Click to upload W9"}</p>
                <input 
                  id="w9-upload" 
                  type="file" 
                  accept=".pdf" 
                  className="hidden" 
                  onChange={handleFileChange} 
                />
              </div>
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
