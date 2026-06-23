import React, { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Image as ImageIcon } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { supabase } from '@/lib/supabaseClient';

export default function DocumentViewer({ fileUrl, fileType }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [signedUrl, setSignedUrl] = useState(null);

  useEffect(() => {
    async function fetchSignedUrl() {
      if (!fileUrl) {
        setSignedUrl(null);
        return;
      }
      if (fileUrl.startsWith('http') || fileUrl.startsWith('blob:')) {
        setSignedUrl(fileUrl);
        return;
      }
      
      const { data, error } = await supabase.storage
        .from('invoices')
        .createSignedUrl(fileUrl, 3600);
        
      if (data && !error) {
        setSignedUrl(data.signedUrl);
      } else {
        console.error("Failed to generate signed URL:", error);
      }
    }
    fetchSignedUrl();
  }, [fileUrl]);

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.25, 0.5));
  const handleRotate = () => setRotation(r => (r + 90) % 360);

  if (!signedUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 text-slate-400 rounded-lg border border-dashed">
        <ImageIcon className="h-12 w-12 mb-2" />
        <p>{fileUrl ? "Loading document..." : "No document attached"}</p>
      </div>
    );
  }

  const isPdf = fileType === 'application/pdf' || (fileUrl && fileUrl.toLowerCase().includes('.pdf')) || (signedUrl && signedUrl.toLowerCase().includes('.pdf'));

  return (
    <div className="flex flex-col h-full bg-slate-100/50 rounded-xl overflow-hidden border">
      <div className="flex items-center justify-end p-2 bg-white border-b gap-2 z-10 shadow-sm">
        <Button variant="outline" size="icon" onClick={handleZoomOut} className="h-8 w-8"><ZoomOut className="h-4 w-4" /></Button>
        <span className="text-xs font-medium w-12 text-center">{Math.round(zoom * 100)}%</span>
        <Button variant="outline" size="icon" onClick={handleZoomIn} className="h-8 w-8"><ZoomIn className="h-4 w-4" /></Button>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <Button variant="outline" size="icon" onClick={handleRotate} className="h-8 w-8"><RotateCw className="h-4 w-4" /></Button>
      </div>
      
      <div className="flex-1 overflow-auto relative flex items-center justify-center bg-slate-200/50 p-4">
        <div 
          className="transition-transform duration-200 origin-center shadow-xl rounded-sm bg-white"
          style={{ 
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            minWidth: isPdf ? '100%' : 'auto',
            minHeight: isPdf ? '100%' : 'auto'
          }}
        >
          {isPdf ? (
            <iframe 
              src={`${signedUrl}#toolbar=0`} 
              className="w-full h-[800px] border-0 bg-white" 
              title="Document Viewer"
            />
          ) : (
            <img 
              src={signedUrl} 
              alt="Invoice Document" 
              className="max-w-full h-auto object-contain"
              draggable="false"
            />
          )}
        </div>
      </div>
    </div>
  );
}
