import React, { useState, useEffect } from 'react';
import { Upload, FileText, Mail, Globe, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import { extractInvoiceData } from '@/lib/invoiceExtractor';

export default function InvoiceUploader({ open, onOpenChange, onInvoiceExtracted }) {
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState('');
  const [extractionDone, setExtractionDone] = useState(false);
  const [fileUrl, setFileUrl] = useState(null);

  // Cleanup object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [fileUrl]);

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    setFile(selectedFile);
    await processFile(selectedFile, 'manual_upload');
  };

  const processFile = async (fileToProcess, source) => {
    setUploading(true);
    setProgress('Preparing file...');
    setExtractionDone(false);

    try {
      // Upload file to Supabase Storage (or use blob for now)
      // Revoke any previous URL before creating a new one
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
      }
      const newFileUrl = URL.createObjectURL(fileToProcess);
      setFileUrl(newFileUrl);

      // Run AI/OCR extraction
      const extractedData = await extractInvoiceData(fileToProcess, (msg) => {
        setProgress(msg);
      });

      setExtractionDone(true);
      setProgress('Extraction complete!');

      // Wait a moment to show success state
      await new Promise(r => setTimeout(r, 800));

      const invoiceData = {
        vendor_name: extractedData.vendor_name || '',
        vendor_address: extractedData.vendor_address || '',
        invoice_number: extractedData.invoice_number || '',
        invoice_date: extractedData.invoice_date || '',
        due_date: extractedData.due_date || '',
        payment_terms: extractedData.payment_terms || '',
        purchase_order: extractedData.purchase_order || '',
        subtotal: extractedData.subtotal || 0,
        tax_amount: extractedData.tax_amount || 0,
        fuel_surcharge: extractedData.fuel_surcharge || 0,
        delivery_fee: extractedData.delivery_fee || 0,
        other_charges: extractedData.other_charges || 0,
        total_amount: extractedData.total_amount || 0,
        line_items: extractedData.line_items || [],
        file_url: newFileUrl,
        source,
        status: 'pending_review',
        extraction_method: extractedData.extraction_method || 'manual',
        raw_text: extractedData.raw_text || '',
      };

      onInvoiceExtracted(invoiceData);
      onOpenChange(false);

      const method = extractedData.extraction_method;
      if (method === 'gemini') {
        toast.success('Invoice extracted with Gemini AI! Please review the details.');
      } else {
        toast.success('Invoice uploaded. Please fill in the details manually.');
      }
    } catch (error) {
      toast.error('Error processing invoice: ' + (error.message || 'Unknown error'));
      console.error('Invoice extraction error:', error);
    } finally {
      setUploading(false);
      setFile(null);
      setProgress('');
      setExtractionDone(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      setFile(droppedFile);
      await processFile(droppedFile, 'manual_upload');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-teal-600" />
            Upload Invoice
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="upload" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email
            </TabsTrigger>
            <TabsTrigger value="portal" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Portal
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-4">
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-teal-400 transition-colors"
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  {extractionDone ? (
                    <CheckCircle2 className="h-10 w-10 text-green-500 animate-in zoom-in-50" />
                  ) : (
                    <Loader2 className="h-10 w-10 text-teal-500 animate-spin" />
                  )}
                  <p className="text-slate-700 font-medium">{progress}</p>
                  {file && (
                    <p className="text-xs text-slate-400 mt-1">
                      {file.name} ({(file.size / 1024).toFixed(0)} KB)
                    </p>
                  )}
                  {/* Progress bar */}
                  <div className="w-full max-w-xs h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                    <div 
                      className={`h-full rounded-full transition-all duration-700 ${
                        extractionDone ? 'bg-green-500 w-full' : 'bg-teal-500 w-2/3 animate-pulse'
                      }`}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="h-14 w-14 rounded-xl bg-teal-50 flex items-center justify-center mx-auto">
                    <FileText className="h-7 w-7 text-teal-600" />
                  </div>
                  <p className="mt-4 text-slate-700 font-medium">
                    Drop your invoice here or click to browse
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    Supports PDF, PNG, JPG — AI will extract all details
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-xs text-amber-600 font-medium">
                      Gemini AI-Powered Extraction
                    </span>
                  </div>
                  <Input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="invoice-upload"
                  />
                  <Button asChild className="mt-4 bg-teal-600 hover:bg-teal-700">
                    <label htmlFor="invoice-upload" className="cursor-pointer">
                      Select File
                    </label>
                  </Button>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="email" className="mt-4">
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-slate-600">
                  Forward invoices to your dedicated email address:
                </p>
                <p className="font-mono text-sm bg-white px-3 py-2 rounded mt-2 border">
                  invoices@your-company.edgeops.io
                </p>
              </div>
              <p className="text-sm text-slate-500">
                Invoices sent to this address will be automatically extracted and added to your pending list.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="portal" className="mt-4">
            <div className="space-y-4">
              <Label>Vendor Portal URL</Label>
              <Input placeholder="https://vendor-portal.com/invoices" />
              <Button className="w-full bg-teal-600 hover:bg-teal-700">
                Connect Portal
              </Button>
              <p className="text-sm text-slate-500">
                Connect to your vendor's portal to automatically import invoices.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}