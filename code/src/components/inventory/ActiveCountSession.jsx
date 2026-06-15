import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Check, X, AlertCircle, ScanBarcode, Camera } from 'lucide-react';
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ActiveCountSession({ sheet, inventory, onComplete, onCancel }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [counts, setCounts] = useState({});
  const [isScanning, setIsScanning] = useState(false);

  // Auto-sort items by location zone to mimic walk-path
  const sortedItems = useMemo(() => {
    if (!sheet || !sheet.items) return [];
    return [...sheet.items].sort((a, b) => {
      const locA = (a.location || 'Unassigned').toLowerCase();
      const locB = (b.location || 'Unassigned').toLowerCase();
      if (locA < locB) return -1;
      if (locA > locB) return 1;
      return a.product_name.localeCompare(b.product_name);
    });
  }, [sheet]);

  if (!sheet || sortedItems.length === 0) return null;

  const currentItem = sortedItems[currentIndex];
  // Match with actual inventory record to get theoretical
  const inventoryRecord = inventory.find(i => i.product_id === currentItem.product_id);
  const theoretical = inventoryRecord?.current_quantity || 0;
  
  const currentCount = counts[currentItem.product_id] !== undefined ? counts[currentItem.product_id].toString() : '';

  const handleNumpad = (num) => {
    const val = currentCount + num;
    setCounts({ ...counts, [currentItem.product_id]: val });
  };

  const handleClear = () => {
    setCounts({ ...counts, [currentItem.product_id]: '' });
  };

  const handleNext = () => {
    if (currentIndex < sortedItems.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onComplete(counts);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const progress = ((currentIndex + 1) / sortedItems.length) * 100;

  // Calculate Variance for immediate feedback (Phase 3 logic)
  const actualVal = currentCount ? parseFloat(currentCount) : null;
  const isVariance = actualVal !== null && actualVal !== theoretical;

  const handleSimulateScan = () => {
    // Pick a random item from the remaining items to simulate a successful scan
    const nextUncountedIndex = sortedItems.findIndex((item, idx) => idx !== currentIndex && !counts[item.product_id]);
    const targetIndex = nextUncountedIndex !== -1 ? nextUncountedIndex : Math.floor(Math.random() * sortedItems.length);
    
    setIsScanning(false);
    setCurrentIndex(targetIndex);
    toast.success(`Scanned: ${sortedItems[targetIndex].product_name}`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col md:items-center md:justify-center md:bg-black/50">
      <div className="flex-1 w-full bg-background flex flex-col md:max-w-md md:h-[800px] md:max-h-[90vh] md:rounded-2xl md:shadow-2xl md:overflow-hidden md:border">
        
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between bg-card shrink-0">
          <Button variant="ghost" size="icon" onClick={onCancel}><X className="h-5 w-5" /></Button>
          <div className="text-center">
            <h2 className="font-bold text-lg">{sheet.name}</h2>
            <p className="text-xs text-muted-foreground">{currentIndex + 1} of {sortedItems.length}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={() => setIsScanning(!isScanning)}>
              <ScanBarcode className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onComplete(counts)} className="text-primary font-medium">Done</Button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-1 bg-secondary shrink-0">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        {/* Item Details or Scanner Overlay */}
        {isScanning ? (
          <div className="p-6 flex-1 flex flex-col items-center justify-center text-center space-y-6 bg-black relative overflow-hidden">
            <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
            <Camera className="h-16 w-16 text-white/50 animate-pulse mb-4" />
            <div className="w-64 h-64 border-2 border-primary/50 relative">
               <div className="absolute top-0 left-0 w-full h-1 bg-resend-green animate-[scan_2s_ease-in-out_infinite] shadow-[0_0_15px_rgba(40,167,69,0.8)]"></div>
            </div>
            <p className="text-white font-medium z-10">Point camera at a barcode</p>
            <Button className="mt-8 z-10 bg-primary hover:bg-primary text-white" onClick={handleSimulateScan}>
              Simulate Successful Scan
            </Button>
            <Button variant="ghost" className="text-white/70 hover:text-white z-10 mt-2" onClick={() => setIsScanning(false)}>
              Cancel Scanning
            </Button>
            <style jsx>{`
              @keyframes scan {
                0% { top: 0; }
                50% { top: 100%; }
                100% { top: 0; }
              }
            `}</style>
          </div>
        ) : (
          <div className="p-6 flex-1 flex flex-col items-center justify-center text-center space-y-4 bg-slate-50/50">
            <Badge variant="outline" className="text-xs tracking-wider uppercase text-muted-foreground bg-white">
              {currentItem.location || 'Unassigned Zone'}
            </Badge>
            
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{currentItem.product_name}</h1>
            <p className="text-lg text-muted-foreground">Count in <span className="font-bold text-primary">{currentItem.unit || 'ea'}</span></p>
          
          <div className="w-full max-w-[240px] mt-4 relative">
            <div className={`text-6xl font-black py-4 border-b-4 ${isVariance ? 'text-resend-orange border-resend-orange' : 'text-foreground border-foreground'} transition-colors`}>
              {currentCount || '0'}
            </div>
            
            {/* Theoretical Variance Display */}
            {actualVal !== null && (
              <div className={`mt-3 flex items-center justify-center gap-2 text-sm font-medium ${isVariance ? 'text-resend-orange' : 'text-resend-green'}`}>
                {isVariance ? (
                  <>
                    <AlertCircle className="h-4 w-4" />
                    Theoretical: {theoretical} (Variance: {(actualVal - theoretical).toFixed(1)})
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Matches Theoretical ({theoretical})
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {/* Massive Touch Numpad */}
        <div className="bg-card p-4 pb-8 shrink-0">
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <Button 
                key={num} 
                variant="outline" 
                className="h-16 text-2xl font-semibold bg-white active:bg-secondary touch-manipulation"
                onClick={() => handleNumpad(num.toString())}
              >
                {num}
              </Button>
            ))}
            <Button 
              variant="outline" 
              className="h-16 text-2xl font-semibold bg-white active:bg-secondary touch-manipulation"
              onClick={() => handleNumpad('.')}
            >
              .
            </Button>
            <Button 
              variant="outline" 
              className="h-16 text-2xl font-semibold bg-white active:bg-secondary touch-manipulation"
              onClick={() => handleNumpad('0')}
            >
              0
            </Button>
            <Button 
              variant="outline" 
              className="h-16 text-lg font-medium text-destructive hover:text-destructive bg-white active:bg-secondary touch-manipulation"
              onClick={handleClear}
            >
              CLR
            </Button>
          </div>

          {/* Navigation */}
          <div className="flex gap-3">
            <Button 
              variant="secondary" 
              className="flex-1 h-14 text-base" 
              onClick={handlePrev} 
              disabled={currentIndex === 0}
            >
              <ArrowLeft className="h-5 w-5 mr-2" /> Prev
            </Button>
            <Button 
              className="flex-1 h-14 text-base bg-primary hover:bg-primary/90" 
              onClick={handleNext}
            >
              {currentIndex === sortedItems.length - 1 ? 'Finish' : 'Next'} <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
