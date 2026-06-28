import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { UploadCloud, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import Papa from 'papaparse';
import { api } from '@/lib/apiClient';

export default function VendorBulkTools({ vendorId }) {
  const { organization } = useAuth();
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await api.entities.VendorItem.filter(
        { vendor_id: vendorId, organization_id: organization?.id },
        { orderBy: 'vendor_item_name' }
      );
      
      if (!data || data.length === 0) {
        toast.info("No items to export for this vendor.");
        setIsExporting(false);
        return;
      }

      const csv = Papa.unparse(data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `vendor_${vendorId}_catalog.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Export complete");
    } catch (err) {
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsImporting(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data;
          if (rows.length === 0) throw new Error("CSV is empty");
          
          // Basic validation checking for required column "vendor_item_name"
          if (!rows[0].hasOwnProperty('vendor_item_name')) {
            throw new Error("Missing required column: vendor_item_name");
          }

          const itemsToInsert = rows.map(row => ({
            organization_id: organization?.id,
            vendor_id: vendorId,
            vendor_item_name: row.vendor_item_name,
            vendor_item_code: row.vendor_item_code || null,
            vendor_unit: row.vendor_unit || null,
            pack_size: row.pack_size || null,
            default_price: row.default_price ? parseFloat(row.default_price) : null,
            on_order_guide: row.on_order_guide === 'true' || row.on_order_guide === 'TRUE' || row.on_order_guide === '1',
            preferred_quantity: row.preferred_quantity ? parseFloat(row.preferred_quantity) : 1
          }));

          for (const item of itemsToInsert) {
            const matches = await api.entities.VendorItem.filter({
              organization_id: item.organization_id,
              vendor_id: item.vendor_id,
              vendor_item_code: item.vendor_item_code,
              vendor_item_name: item.vendor_item_name,
            }, { limit: 1 });

            if (matches[0]) {
              await api.entities.VendorItem.update(matches[0].id, item);
            } else {
              await api.entities.VendorItem.create(item);
            }
          }
          
          toast.success(`Successfully imported ${itemsToInsert.length} items`);
          // Note: The VendorItemsTab will need to be re-focused or query invalidated.
          // Usually handled by React Query invalidating the query key globally if we imported useQueryClient here.
        } catch (err) {
          toast.error(`Import failed: ${err.message}`);
        } finally {
          setIsImporting(false);
          e.target.value = null; // Reset input
        }
      },
      error: (error) => {
        toast.error(`CSV Parsing error: ${error.message}`);
        setIsImporting(false);
      }
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="shadow-sm border-border/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Export Catalog
          </CardTitle>
          <CardDescription>Download a CSV of all vendor items, order guides, and pricing.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-6">
            Exporting the catalog is useful for making bulk changes in Excel before re-importing, or for sharing product lists with other departments.
          </p>
          <Button onClick={handleExport} disabled={isExporting} className="w-full">
            {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
            Download CSV
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-border/40 bg-secondary/5 border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-primary" />
            Bulk Import Catalog
          </CardTitle>
          <CardDescription>Upload a CSV to add or update multiple items at once.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-3 bg-card border border-border/40 rounded text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Required Columns:</p>
              <p><code>vendor_item_name</code></p>
              <p className="font-semibold text-foreground mt-2">Optional Columns:</p>
              <p><code>vendor_item_code</code>, <code>vendor_unit</code>, <code>pack_size</code>, <code>default_price</code>, <code>on_order_guide</code> (true/false), <code>preferred_quantity</code></p>
            </div>
            
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="csv-upload" className="sr-only">Upload CSV</Label>
              <Input 
                id="csv-upload" 
                type="file" 
                accept=".csv"
                onChange={handleImport}
                disabled={isImporting}
                className="cursor-pointer file:cursor-pointer"
              />
            </div>
            {isImporting && (
              <p className="text-sm text-muted-foreground flex items-center">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing import...
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
