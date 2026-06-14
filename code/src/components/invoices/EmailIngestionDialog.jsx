import React, { useState, useEffect } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Loader2, KeyRound, Server, Save } from "lucide-react";
import { supabase } from '@/lib/supabaseClient';

export default function EmailIngestionDialog({ open, onClose }) {
  const queryClient = useQueryClient();
  const { userProfile, organization, brand, location } = useAuth();
  
  const [form, setForm] = useState({
    host: 'imap.gmail.com',
    port: '993',
    username: '',
    password: '',
  });

  const { data: integrations = [], isLoading } = useAuthQuery({
    queryKey: ['integrations'],
    queryFn: () => api.entities.Integration.list(),
  });

  // Find existing email configuration
  const emailConfig = integrations.find(i => i.provider === 'email_imap');

  useEffect(() => {
    if (emailConfig && emailConfig.metadata) {
      setForm({
        host: emailConfig.metadata.host || 'imap.gmail.com',
        port: emailConfig.metadata.port || '993',
        username: emailConfig.metadata.username || '',
        password: emailConfig.metadata.password || '',
      });
    }
  }, [emailConfig]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const orgId = organization?.id || userProfile?.organization_id;
      const metadata = {
        host: data.host,
        port: data.port,
        username: data.username,
        organization_id: orgId,
        brand_id: brand?.id || null,
        location_id: location?.id || userProfile?.location_id || null,
      };
      
      const { data: result, error } = await supabase.rpc('save_secure_integration_credential', {
        p_organization_id: orgId,
        p_provider: 'email_imap',
        p_metadata: metadata,
        p_secret: data.password
      });

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['integrations']);
      toast.success('Email configuration saved securely!');
      onClose();
    },
    onError: (error) => {
      toast.error(`Failed to save configuration: ${error.message}`);
    }
  });

  const handleSave = () => {
    if (!form.host || !form.port || !form.username || !form.password) {
      toast.error("Please fill in all fields.");
      return;
    }
    saveMutation.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-[32px] p-8">
        <DialogHeader className="mb-6 space-y-3">
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-2 shadow-inner">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-2xl font-black text-foreground tracking-tight">Email Ingestion Config</DialogTitle>
          <DialogDescription className="font-medium text-muted-foreground">
            Configure your IMAP settings. The platform will automatically check this inbox for invoice attachments and process them securely.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-3 space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground uppercase">IMAP Host</Label>
                <div className="relative">
                  <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="imap.gmail.com" 
                    className="pl-9 h-11 rounded-xl bg-secondary/50 border-border" 
                    value={form.host}
                    onChange={e => setForm({...form, host: e.target.value})}
                  />
                </div>
              </div>
              <div className="col-span-1 space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground uppercase">Port</Label>
                <Input 
                  placeholder="993" 
                  className="h-11 rounded-xl bg-secondary/50 border-border text-center" 
                  value={form.port}
                  onChange={e => setForm({...form, port: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Email Address (Username)</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  type="email"
                  placeholder="invoices@yourcompany.com" 
                  className="pl-9 h-11 rounded-xl bg-secondary/50 border-border" 
                  value={form.username}
                  onChange={e => setForm({...form, username: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">App Password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  type="password"
                  placeholder="••••••••••••••••" 
                  className="pl-9 h-11 rounded-xl bg-secondary/50 border-border" 
                  value={form.password}
                  onChange={e => setForm({...form, password: e.target.value})}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 px-1">
                For security, please use an App Password instead of your regular email password.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="mt-8 gap-3 sm:justify-end">
          <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            className="flex-1 rounded-xl h-11 bg-primary hover:bg-primary text-primary-foreground shadow-lg shadow-primary/10" 
            onClick={handleSave}
            disabled={saveMutation.isLoading || isLoading}
          >
            {saveMutation.isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Config
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
