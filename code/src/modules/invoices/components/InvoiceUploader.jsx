import React, { useState, useEffect } from 'react';
import { Upload, FileText, Mail, Globe, Loader2, Sparkles, CheckCircle2, Camera, RefreshCw, Trash2, DollarSign } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { supabase } from '@/lib/supabaseClient';
import { api } from '@/lib/apiClient';
import { hashFile } from '@/lib/fileHash';
import { useConfirmation } from '@/hooks/useConfirmation';

const MAX_INVOICE_FILE_BYTES = 50 * 1024 * 1024;
const ACCEPTED_INVOICE_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const ACCEPTED_INVOICE_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp']);

const getFileExtension = (name = '') => name.split('.').pop()?.toLowerCase() || '';

const validateInvoiceFile = (selectedFile) => {
  if (!selectedFile || selectedFile.size <= 0) {
    return 'Invoice file is empty.';
  }

  if (selectedFile.size > MAX_INVOICE_FILE_BYTES) {
    return 'Invoice file must be 50 MB or smaller.';
  }

  const extension = getFileExtension(selectedFile.name);
  if (!ACCEPTED_INVOICE_MIME_TYPES.has(selectedFile.type) || !ACCEPTED_INVOICE_EXTENSIONS.has(extension)) {
    return 'Invoice file must be a PDF, JPG, PNG, or WebP image.';
  }

  return null;
};
export default function InvoiceUploader({
  open,
  onOpenChange,
  onInvoiceExtracted,
  onCreateUploadDraft,
  onFinalizeUploadDraft,
  onUploadDraftFailed,
  organizationId
}) {
  const { confirm } = useConfirmation();
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState('');
  const [extractionDone, setExtractionDone] = useState(false);
  const [fileUrl, setFileUrl] = useState(null);

  // Review step: file has been selected/captured but not yet uploaded.
  const [reviewFile, setReviewFile] = useState(null);
  const [reviewSource, setReviewSource] = useState(null);
  const [reviewPreviewUrl, setReviewPreviewUrl] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState('unpaid');

  // WebRTC Camera State
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState('environment');
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);

  // Cleanup object URLs and Camera to prevent memory leaks
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [fileUrl]);

  useEffect(() => {
    return () => {
      if (reviewPreviewUrl) URL.revokeObjectURL(reviewPreviewUrl);
    };
  }, [reviewPreviewUrl]);

  // Discard any in-progress review when the dialog is closed.
  useEffect(() => {
    if (!open) discardReview();
  }, [open]);

  const startCamera = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: cameraFacingMode }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err) {
      console.error("Error accessing camera: ", err);
      toast.error("Could not access camera. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const switchCamera = () => {
    setCameraFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
    // Restart camera if it's currently active
    if (cameraActive) {
      startCamera();
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `receipt_${Date.now()}.png`, { type: 'image/png' });
      stopCamera();
      startReview(file, 'camera');
    }, 'image/png');
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validationError = validateInvoiceFile(selectedFile);
    if (validationError) {
      toast.error(validationError);
      e.target.value = '';
      return;
    }

    startReview(selectedFile, 'manual_upload');
  };

  const startReview = (selectedFile, source) => {
    const validationError = validateInvoiceFile(selectedFile);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (reviewPreviewUrl) URL.revokeObjectURL(reviewPreviewUrl);
    setReviewFile(selectedFile);
    setReviewSource(source);
    setReviewPreviewUrl(URL.createObjectURL(selectedFile));
    setPaymentStatus('unpaid');
  };

  const discardReview = () => {
    if (reviewPreviewUrl) URL.revokeObjectURL(reviewPreviewUrl);
    setReviewFile(null);
    setReviewSource(null);
    setReviewPreviewUrl(null);
    setPaymentStatus('unpaid');
  };

  const confirmReview = async () => {
    const fileToProcess = reviewFile;
    const source = reviewSource;
    const status = paymentStatus;
    if (reviewPreviewUrl) URL.revokeObjectURL(reviewPreviewUrl);
    setReviewFile(null);
    setReviewSource(null);
    setReviewPreviewUrl(null);
    setFile(fileToProcess);
    await processFile(fileToProcess, source, status);
  };

  const processFile = async (fileToProcess, source, invoicePaymentStatus) => {
    setUploading(true);
    setProgress('Preparing invoice record...');
    setExtractionDone(false);

    let draftInvoice = null;
    let uploadedFilePath = null;

    try {
      const fileHash = await hashFile(fileToProcess);

      if (organizationId) {
        const duplicates = await api.financial.findDuplicateInvoiceDocuments({ organizationId, fileHash }).catch(() => []);
        if (duplicates.length > 0) {
          const match = duplicates[0];
          const proceed = await confirm({
            title: 'Duplicate invoice detected',
            description: `This file looks identical to an invoice already uploaded (${match.vendor_name || 'Unknown Vendor'}${match.invoice_number ? ` #${match.invoice_number}` : ''}, ${match.status || 'pending_review'}). Upload it again anyway?`,
            confirmText: 'Upload Anyway',
            cancelText: 'Cancel Upload',
            variant: 'warning',
            severity: 'high',
          });
          if (!proceed) {
            setUploading(false);
            return;
          }
        }
      }

      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
      }
      const newFileUrl = URL.createObjectURL(fileToProcess);
      setFileUrl(newFileUrl);

      const fileExt = getFileExtension(fileToProcess.name) || 'pdf';
      const fileName = `${Date.now()}_${crypto.randomUUID()}.${fileExt}`;

      if (onCreateUploadDraft) {
        draftInvoice = await onCreateUploadDraft({
          source,
          fileType: fileToProcess.type,
          fileName,
        });
      }

      setProgress('Uploading file...');

      const pathOwner = draftInvoice?.organization_id || organizationId || 'unassigned';
      const filePath = `${pathOwner}/${draftInvoice?.id || 'pending'}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filePath, fileToProcess);

      if (uploadError) throw uploadError;
      uploadedFilePath = filePath;

      // Removed getPublicUrl because the bucket is now private.
      // We store the raw filePath directly in the database.

      let documentId = null;
      try {
        documentId = await api.financial.registerInvoiceDocument({
          storagePath: filePath,
          fileName: fileToProcess.name,
          fileType: fileToProcess.type,
          fileSize: fileToProcess.size,
          fileHash,
          source: 'upload',
          invoiceId: draftInvoice?.id || null,
          organizationId: pathOwner !== 'unassigned' ? pathOwner : null,
        });
      } catch (registerError) {
        console.error('Failed to register invoice document metadata:', registerError);
      }

      setExtractionDone(true);
      setProgress('Upload complete! Extraction started...');

      await new Promise(r => setTimeout(r, 800));

      const invoiceData = {
        status: 'extracting',
        ap_status: 'processing',
        file_url: filePath,
        file_type: fileToProcess.type,
        source,
        vendor_name: draftInvoice?.vendor_name || 'Pending Vendor',
        invoice_number: draftInvoice?.invoice_number || `PENDING-${Date.now()}`,
        total_amount: draftInvoice?.total_amount ?? 0,
        payment_status: invoicePaymentStatus === 'paid' ? 'paid' : 'unpaid',
      };

      if (draftInvoice?.id && onFinalizeUploadDraft) {
        await onFinalizeUploadDraft(draftInvoice.id, invoiceData);
      } else {
        const savedInvoice = await onInvoiceExtracted(invoiceData);
        if (documentId && savedInvoice?.id) {
          api.financial.attachInvoiceDocument({ documentId, invoiceId: savedInvoice.id })
            .catch((attachError) => console.error('Failed to attach invoice document:', attachError));
        }
      }
      onOpenChange(false);
      toast.success('Invoice uploaded. Extraction is running in the background.');
    } catch (error) {
      if (uploadedFilePath) {
        const { error: removeError } = await supabase.storage
          .from('invoices')
          .remove([uploadedFilePath]);
        if (removeError) {
          console.error('Failed to remove invoice file after DB update failure:', removeError);
        }
      }

      if (draftInvoice?.id && onUploadDraftFailed) {
        try {
          await onUploadDraftFailed(draftInvoice.id, error);
        } catch (draftError) {
          console.error('Failed to mark invoice upload draft as failed:', draftError);
        }
      }

      toast.error('Error uploading invoice: ' + (error.message || 'Unknown error'));
      console.error('Invoice upload error:', error);
    } finally {
      setUploading(false);
      setFile(null);
      setProgress('');
      setExtractionDone(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;

    startReview(droppedFile, 'manual_upload');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={reviewFile ? "sm:max-w-2xl" : "sm:max-w-lg"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-teal-600" />
            Upload Invoice
          </DialogTitle>
        </DialogHeader>

        {reviewFile ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border bg-muted/40 overflow-hidden flex items-center justify-center min-h-[420px]">
              {reviewFile.type?.startsWith('image/') ? (
                <img
                  src={reviewPreviewUrl}
                  alt="Invoice preview"
                  className="max-h-[520px] w-full object-contain"
                />
              ) : (
                <object
                  data={reviewPreviewUrl}
                  type={reviewFile.type || 'application/pdf'}
                  className="w-full h-[520px]"
                >
                  <div className="flex flex-col items-center gap-2 py-12">
                    <FileText className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{reviewFile.name}</p>
                  </div>
                </object>
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {reviewFile.name} ({(reviewFile.size / 1024).toFixed(0)} KB)
            </p>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                Payment status
              </Label>
              <RadioGroup
                value={paymentStatus}
                onValueChange={setPaymentStatus}
                className="grid grid-cols-2 gap-3"
              >
                <label
                  htmlFor="payment-status-unpaid"
                  className={`flex items-center gap-2 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                    paymentStatus === 'unpaid'
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-input text-foreground hover:bg-accent/50'
                  }`}
                >
                  <RadioGroupItem value="unpaid" id="payment-status-unpaid" />
                  Unpaid
                </label>
                <label
                  htmlFor="payment-status-paid"
                  className={`flex items-center gap-2 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                    paymentStatus === 'paid'
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-input text-foreground hover:bg-accent/50'
                  }`}
                >
                  <RadioGroupItem value="paid" id="payment-status-paid" />
                  Paid
                </label>
              </RadioGroup>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                onClick={discardReview}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
              <Button className="flex-1 bg-teal-600 hover:bg-teal-700" onClick={confirmReview}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Accept &amp; Continue
              </Button>
            </div>
          </div>
        ) : (
        <Tabs defaultValue="upload" className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="camera" className="flex items-center gap-2" onClick={() => { if (!cameraActive) startCamera(); }}>
              <Camera className="h-4 w-4" />
              Camera
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
              className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-teal-400 transition-colors"
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  {extractionDone ? (
                    <CheckCircle2 className="h-10 w-10 text-green-500 animate-in zoom-in-50" />
                  ) : (
                    <Loader2 className="h-10 w-10 text-teal-500 animate-spin" />
                  )}
                  <p className="text-muted-foreground font-medium">{progress}</p>
                  {file && (
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {file.name} ({(file.size / 1024).toFixed(0)} KB)
                    </p>
                  )}
                  {/* Progress bar */}
                  <div className="w-full max-w-xs h-1.5 bg-muted rounded-full overflow-hidden mt-2">
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
                  <p className="mt-4 text-muted-foreground font-medium">
                    Drop your invoice here or click to browse
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Supports PDF, JPG, PNG, or WebP up to 50 MB
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-xs text-amber-600 font-medium">
                      Azure AI-Powered Extraction
                    </span>
                  </div>
                  <Input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
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

          <TabsContent value="camera" className="mt-4">
            <div className="border-2 border-dashed border-border rounded-xl p-4 text-center">
              {uploading ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  {extractionDone ? (
                    <CheckCircle2 className="h-10 w-10 text-green-500 animate-in zoom-in-50" />
                  ) : (
                    <Loader2 className="h-10 w-10 text-teal-500 animate-spin" />
                  )}
                  <p className="text-muted-foreground font-medium">{progress}</p>
                </div>
              ) : cameraActive ? (
                <div className="relative rounded-lg overflow-hidden bg-black flex items-center justify-center min-h-[300px]">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full max-h-[400px] object-cover"
                  />
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 px-4">
                    <Button variant="outline" size="icon" onClick={switchCamera} className="bg-black/50 text-white border-white/20 hover:bg-black/70">
                      <RefreshCw className="h-5 w-5" />
                    </Button>
                    <Button onClick={capturePhoto} className="bg-teal-600 hover:bg-teal-700 px-8 rounded-full">
                      <Camera className="h-5 w-5 mr-2" /> Snap Receipt
                    </Button>
                    <Button variant="outline" size="icon" onClick={stopCamera} className="bg-black/50 text-white border-white/20 hover:bg-black/70">
                      <FileText className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="py-8">
                  <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
                    <Camera className="h-7 w-7 text-muted-foreground/70" />
                  </div>
                  <Button onClick={startCamera} className="bg-teal-600 hover:bg-teal-700">
                    Enable Camera
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="email" className="mt-4">
            <div className="space-y-4">
              <div className="bg-muted/40 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  Forward invoices to your dedicated email address:
                </p>
                <p className="font-mono text-sm bg-card px-3 py-2 rounded mt-2 border">
                  invoices@your-company.restops.io
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
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
              <p className="text-sm text-muted-foreground">
                Connect to your vendor's portal to automatically import invoices.
              </p>
            </div>
          </TabsContent>
        </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}



