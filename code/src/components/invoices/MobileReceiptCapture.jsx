import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, UploadCloud, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
// extractInvoiceData import removed

export default function MobileReceiptCapture({ open, onOpenChange, onInvoiceExtracted }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  const [stream, setStream] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [hasCameraError, setHasCameraError] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  useEffect(() => {
    if (open && !capturedImage) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [open, capturedImage]);

  const startCamera = async () => {
    setHasCameraError(false);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setHasCameraError(true);
      toast.error('Could not access the camera. Please check your permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageUrl = canvas.toDataURL('image/jpeg', 0.8);
      setCapturedImage(imageUrl);
      stopCamera();
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const handleUpload = async () => {
    if (!capturedImage) return;
    setIsUploading(true);
    setProgressMsg('Uploading image...');
    try {
      const res = await fetch(capturedImage);
      const blob = await res.blob();
      const file = new File([blob], `receipt_${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      const fileExt = file.name?.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `mobile_uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('invoices')
        .getPublicUrl(filePath);

      const invoiceData = {
        vendor_name: 'Extracting...',
        total_amount: 0,
        file_url: publicUrlData.publicUrl,
        file_type: file.type,
        source: 'mobile_camera',
        status: 'extracting',
      };
      
      toast.success('Receipt captured! Extraction is running in the background.');
      onInvoiceExtracted(invoiceData);
      onOpenChange(false);
    } catch (err) {
      console.error('Upload failed:', err);
      toast.error('Failed to process the receipt: ' + err.message);
    } finally {
      setIsUploading(false);
      setProgressMsg('');
    }
  };

  // Cleanup when modal closes entirely
  const handleOpenChange = (isOpen) => {
    if (!isOpen) {
      setCapturedImage(null);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-black/95 text-white border-zinc-800">
        <DialogHeader className="p-4 bg-black">
          <DialogTitle className="text-white flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Scan Receipt
          </DialogTitle>
        </DialogHeader>

        <div className="relative flex flex-col items-center justify-center bg-black w-full aspect-[3/4] md:aspect-auto md:min-h-[400px]">
          {hasCameraError ? (
            <div className="p-6 text-center text-zinc-400">
              <Camera className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Camera access denied or unavailable.</p>
              <Button variant="outline" className="mt-4 border-zinc-700 text-zinc-300" onClick={startCamera}>
                Try Again
              </Button>
            </div>
          ) : !capturedImage ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 border-2 border-white/20 pointer-events-none m-8 rounded-xl flex items-center justify-center">
                <p className="text-white/50 text-sm tracking-widest uppercase font-semibold">Align Receipt Here</p>
              </div>
            </>
          ) : (
            <img src={capturedImage} alt="Captured receipt" className="absolute inset-0 w-full h-full object-cover" />
          )}
          
          {/* Hidden Canvas for capture */}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <DialogFooter className="p-4 bg-black flex-row justify-center sm:justify-center gap-4">
          {!capturedImage ? (
            <Button 
              size="lg" 
              className="rounded-full h-16 w-16 bg-white hover:bg-zinc-200 border-4 border-zinc-400 p-0"
              onClick={handleCapture}
              disabled={hasCameraError}
            >
              <span className="sr-only">Take Photo</span>
            </Button>
          ) : (
            <div className="flex gap-4 w-full px-4">
              <Button 
                variant="outline" 
                size="lg" 
                className="flex-1 bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800"
                onClick={handleRetake}
                disabled={isUploading}
              >
                <RotateCcw className="h-5 w-5 mr-2" />
                Retake
              </Button>
              <Button 
                size="lg" 
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                onClick={handleUpload}
                disabled={isUploading}
              >
                {isUploading ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <UploadCloud className="h-5 w-5 mr-2" />}
                Use Photo
              </Button>
            </div>
          )}
        </DialogFooter>
        
        {isUploading && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 rounded-lg">
            <Loader2 className="h-10 w-10 text-purple-500 animate-spin mb-4" />
            <p className="text-white text-lg font-medium">{progressMsg}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
