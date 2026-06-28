import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, X, Loader2 } from 'lucide-react';
import { generateVendorCreditRequestEmail } from '@/lib/geminiService';
import { toast } from 'sonner';

export default function AIEmailDrafter({ open, onOpenChange, invoice, po, varianceDetails, onSend }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleDraft = async () => {
    if (!invoice || !invoice.purchase_order_id) return;
    setIsDrafting(true);
    try {
      let details = varianceDetails;
      let poData = po;
      
      if (!details) {
        const { api } = await import('@/lib/apiClient');
        details = await api.reports.getThreeWayMatchStatus(invoice.purchase_order_id);
        if (!poData) poData = { po_number: invoice.purchase_order_id.substring(0, 8) };
      }
      
      const draft = await generateVendorCreditRequestEmail(invoice, poData, details);
      setSubject(draft.subject || '');
      setBody(draft.body || '');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate email draft.');
    } finally {
      setIsDrafting(false);
    }
  };

  useEffect(() => {
    if (open && invoice && !subject && !body) {
      handleDraft();
    }
  }, [open, invoice]);

  const handleSend = async () => {
    if (!subject || !body) return;
    setIsSending(true);
    try {
      await onSend({ subject, body });
      toast.success('Email sent successfully!');
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to send email.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-purple-500" />
            AI Email Drafter
          </DialogTitle>
        </DialogHeader>

        {isDrafting ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
            <p className="text-sm text-muted-foreground">Analyzing variance and drafting email...</p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>To</Label>
              <Input value={invoice?.vendor_name || 'Vendor'} disabled />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input 
                value={subject} 
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email Subject"
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea 
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[250px]"
                placeholder="Type your message here..."
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDrafting || isSending}>
            <X className="h-4 w-4 mr-2" /> Cancel
          </Button>
          {!isDrafting && (
            <Button variant="outline" onClick={handleDraft} disabled={isSending}>
              <Bot className="h-4 w-4 mr-2" /> Re-Draft
            </Button>
          )}
          <Button 
            className="bg-purple-600 hover:bg-purple-700" 
            onClick={handleSend}
            disabled={isDrafting || isSending || !subject || !body}
          >
            {isSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Send Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
