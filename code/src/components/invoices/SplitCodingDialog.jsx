import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, SplitSquareHorizontal } from 'lucide-react';
import { toast } from 'sonner';

export function SplitCodingDialog({ open, onOpenChange, allocation, onSave, glMappings = [] }) {
  const [splits, setSplits] = useState([]);
  const [splitMethod, setSplitMethod] = useState('amount'); // 'amount' or 'percentage'

  useEffect(() => {
    if (open && allocation) {
      setSplits([{
        id: crypto.randomUUID(),
        category_name: allocation.category_name || '',
        gl_code: allocation.gl_code || '',
        amount: allocation.amount || 0,
        percentage: 100
      }]);
    }
  }, [open, allocation]);

  if (!allocation) return null;

  const totalAmount = allocation.amount;

  const handleAddSplit = () => {
    setSplits([
      ...splits, 
      { id: crypto.randomUUID(), category_name: '', gl_code: '', amount: 0, percentage: 0 }
    ]);
  };

  const handleRemoveSplit = (index) => {
    if (splits.length <= 1) return toast.error("Must have at least one split.");
    const newSplits = [...splits];
    newSplits.splice(index, 1);
    setSplits(newSplits);
  };

  const handleChange = (index, field, value) => {
    const newSplits = [...splits];
    const row = { ...newSplits[index], [field]: value };

    // Auto-calculate the other field based on method
    if (splitMethod === 'percentage' && field === 'percentage') {
      const pct = parseFloat(value) || 0;
      row.amount = (totalAmount * (pct / 100));
    } else if (splitMethod === 'amount' && field === 'amount') {
      const amt = parseFloat(value) || 0;
      row.percentage = totalAmount > 0 ? ((amt / totalAmount) * 100) : 0;
    }

    if (field === 'gl_code') {
      const mapping = glMappings.find(m => m.gl_code === value);
      if (mapping) row.category_name = mapping.category;
    }

    newSplits[index] = row;
    setSplits(newSplits);
  };

  const handleSave = () => {
    const totalSplitAmt = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    const totalSplitPct = splits.reduce((sum, s) => sum + (parseFloat(s.percentage) || 0), 0);
    
    // Allow slight rounding differences for amounts
    if (Math.abs(totalSplitAmt - totalAmount) > 0.05) {
      return toast.error(`Total split amount ($${totalSplitAmt.toFixed(2)}) must equal original amount ($${totalAmount.toFixed(2)}).`);
    }

    if (splitMethod === 'percentage' && Math.abs(totalSplitPct - 100) > 0.1) {
      return toast.error(`Total percentage (${totalSplitPct}%) must equal 100%.`);
    }

    // Ensure all rows have a category or gl code
    const invalid = splits.find(s => !s.category_name && !s.gl_code);
    if (invalid) {
      return toast.error("All splits must have a Category or GL Code assigned.");
    }

    onSave(splits);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SplitSquareHorizontal className="h-5 w-5 text-teal-600" />
            Split Coding
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border">
            <div>
              <p className="text-sm font-medium text-slate-500">Original Allocation</p>
              <p className="font-semibold text-lg">{allocation.category_name || 'Uncategorized'}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-500">Total Amount</p>
              <p className="font-semibold text-lg">${totalAmount?.toFixed(2)}</p>
            </div>
            <div>
              <Label>Split Method</Label>
              <Select value={splitMethod} onValueChange={setSplitMethod}>
                <SelectTrigger className="w-[140px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amount">By Amount ($)</SelectItem>
                  <SelectItem value="percentage">By Percentage (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            {splits.map((split, i) => (
              <div key={split.id} className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">GL Account / Category</Label>
                  <Select value={split.gl_code} onValueChange={(val) => handleChange(i, 'gl_code', val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select GL Account..." />
                    </SelectTrigger>
                    <SelectContent>
                      {glMappings.map(m => (
                        <SelectItem key={m.gl_code} value={m.gl_code}>
                          {m.gl_code} - {m.gl_name} ({m.category})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {splitMethod === 'amount' ? (
                  <div className="w-[120px] space-y-1">
                    <Label className="text-xs">Amount ($)</Label>
                    <Input 
                      type="number" step="0.01" 
                      value={split.amount} 
                      onChange={e => handleChange(i, 'amount', e.target.value)} 
                    />
                  </div>
                ) : (
                  <div className="w-[100px] space-y-1">
                    <Label className="text-xs">Percent (%)</Label>
                    <Input 
                      type="number" step="0.1" 
                      value={split.percentage} 
                      onChange={e => handleChange(i, 'percentage', e.target.value)} 
                    />
                  </div>
                )}
                
                <Button variant="ghost" size="icon" onClick={() => handleRemoveSplit(i)} className="text-slate-400 hover:text-red-500 mb-0.5">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={handleAddSplit} className="mt-2 text-teal-600 border-teal-200 hover:bg-teal-50">
            <Plus className="h-4 w-4 mr-1" /> Add Split Row
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} className="bg-teal-600 hover:bg-teal-700">Save Splits</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
