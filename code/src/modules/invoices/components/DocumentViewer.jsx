import React, { useState, useEffect, useRef } from 'react';
import { Download, ZoomIn, ZoomOut, RotateCw, Image as ImageIcon, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { supabase } from '@/lib/supabaseClient';
import { downloadBlob } from '@/lib/exportUtils';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

// Render scale for zoom=1 (100%) — PDF points render quite small at scale 1:1.
const PDF_BASE_SCALE = 1.5;

export default function DocumentViewer({ fileUrl, fileType }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [signedUrl, setSignedUrl] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  const viewportRef = useRef(null);
  const panStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const canvasRefs = useRef([]);
  const renderTasksRef = useRef([]);

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

  // Hand-drag panning. Plain DOM (canvas/img), no iframe involved, so this
  // fires consistently for every browser without any pointer-events tricks.
  const handlePanStart = (e) => {
    const el = viewportRef.current;
    if (!el) return;
    e.preventDefault();
    panStart.current = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
    setIsPanning(true);
  };

  useEffect(() => {
    if (!isPanning) return undefined;
    const onMove = (e) => {
      const el = viewportRef.current;
      if (!el) return;
      el.scrollLeft = panStart.current.scrollLeft - (e.clientX - panStart.current.x);
      el.scrollTop = panStart.current.scrollTop - (e.clientY - panStart.current.y);
    };
    const onUp = () => setIsPanning(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isPanning]);

  const isPdf = fileType === 'application/pdf' || (fileUrl && fileUrl.toLowerCase().includes('.pdf')) || (signedUrl && signedUrl.toLowerCase().includes('.pdf'));

  // Load the PDF once per document. Rendering (below) reruns on zoom/rotation
  // without re-fetching or re-parsing the file.
  useEffect(() => {
    if (!isPdf || !signedUrl) {
      setPdfDoc(null);
      return undefined;
    }
    let cancelled = false;
    setPdfError(null);
    const loadingTask = pdfjsLib.getDocument(signedUrl);
    loadingTask.promise.then((pdf) => {
      if (cancelled) { pdf.destroy(); return; }
      setPdfDoc(pdf);
    }).catch((err) => {
      if (cancelled) return;
      console.error('Failed to load PDF:', err);
      setPdfError('Could not load this PDF for preview.');
    });
    return () => {
      cancelled = true;
      loadingTask.destroy?.();
    };
  }, [isPdf, signedUrl]);

  // Free the previous document's worker-side resources once a new one loads.
  useEffect(() => {
    return () => pdfDoc?.destroy();
  }, [pdfDoc]);

  // Render every page to its own canvas at the current zoom/rotation. Same
  // pixels in every browser — nothing here depends on a native PDF viewer.
  useEffect(() => {
    if (!pdfDoc) return undefined;
    let cancelled = false;

    const renderAll = async () => {
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        if (cancelled) return;
        const canvas = canvasRefs.current[pageNum - 1];
        if (!canvas) continue;

        renderTasksRef.current[pageNum - 1]?.cancel();

        try {
          const page = await pdfDoc.getPage(pageNum);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: zoom * PDF_BASE_SCALE, rotation });
          const outputScale = window.devicePixelRatio || 1;
          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          const renderTask = page.render({
            canvasContext: canvas.getContext('2d'),
            viewport,
            transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
          });
          renderTasksRef.current[pageNum - 1] = renderTask;
          await renderTask.promise;
        } catch (err) {
          if (err?.name !== 'RenderingCancelledException') {
            console.error(`Failed to render PDF page ${pageNum}:`, err);
          }
        }
      }
    };

    renderAll();

    return () => {
      cancelled = true;
      renderTasksRef.current.forEach(task => task?.cancel());
    };
  }, [pdfDoc, zoom, rotation]);

  const handleDownload = async () => {
    if (!signedUrl || downloading) return;
    setDownloading(true);
    try {
      const response = await fetch(signedUrl);
      const blob = await response.blob();
      const filename = fileUrl?.split('/').pop()?.split('?')[0] || 'document';
      downloadBlob(blob, filename);
    } catch (err) {
      console.error('Failed to download document:', err);
    } finally {
      setDownloading(false);
    }
  };

  if (!signedUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-muted/40 text-muted-foreground/70 rounded-lg border border-dashed">
        <ImageIcon className="h-12 w-12 mb-2" />
        <p>{fileUrl ? "Loading document..." : "No document attached"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-100/50 rounded-xl overflow-hidden border">
      <div className="flex items-center justify-end p-2 bg-card border-b gap-2 z-10 shadow-sm">
        <Button variant="outline" size="icon" onClick={handleZoomOut} className="h-8 w-8"><ZoomOut className="h-4 w-4" /></Button>
        <span className="text-xs font-medium w-12 text-center">{Math.round(zoom * 100)}%</span>
        <Button variant="outline" size="icon" onClick={handleZoomIn} className="h-8 w-8"><ZoomIn className="h-4 w-4" /></Button>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <Button variant="outline" size="icon" onClick={handleRotate} className="h-8 w-8"><RotateCw className="h-4 w-4" /></Button>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <Button variant="outline" size="icon" onClick={handleDownload} disabled={downloading} className="h-8 w-8" title="Download document">
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </Button>
      </div>

      {/*
        No items-center/justify-center here: centering an overflowing flex
        child that way makes the "before" side of the overflow unreachable by
        scroll in every browser (the scrollable region only ever grows on the
        end side). Centering via margin:auto on the children below instead
        centers when content fits and leaves 100% of it scrollable when it
        doesn't — verified against scrollWidth/scrollLeft directly.
      */}
      <div
        ref={viewportRef}
        onMouseDown={handlePanStart}
        className={`flex-1 overflow-auto relative flex bg-slate-200/50 p-4 select-none ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        {isPdf ? (
          pdfError ? (
            <div className="m-auto flex flex-col items-center gap-2 text-muted-foreground/70 p-8">
              <AlertTriangle className="h-8 w-8" />
              <p className="text-sm">{pdfError}</p>
              <Button variant="outline" size="sm" onClick={handleDownload}>Download instead</Button>
            </div>
          ) : !pdfDoc ? (
            <Loader2 className="m-auto h-6 w-6 animate-spin text-muted-foreground/70" />
          ) : (
            <div className="m-auto flex flex-col items-center gap-3">
              {Array.from({ length: pdfDoc.numPages }).map((_, i) => (
                <canvas
                  key={i}
                  ref={(el) => { canvasRefs.current[i] = el; }}
                  className="shadow-xl rounded-sm bg-card block"
                />
              ))}
            </div>
          )
        ) : (
          <div
            className="m-auto transition-transform duration-200 origin-center shadow-xl rounded-sm bg-card"
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
          >
            <img
              src={signedUrl}
              alt="Invoice Document"
              className="max-w-full h-auto object-contain"
              draggable="false"
            />
          </div>
        )}
      </div>
    </div>
  );
}
