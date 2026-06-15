import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { FileJson, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';

export default function DataExportTab() {
  const { activeOrg } = useAuth();
  const organizationId = activeOrg?.id;
  const [exporting, setExporting] = useState(null);

  const EXPORTABLE_ENTITIES = [
    { id: 'profiles', label: 'Customers / Profiles', description: 'Export all customer data including contact info.' },
    { id: 'employees', label: 'Staff / Employees', description: 'Export employee records and role information.' },
    { id: 'inventory', label: 'Inventory Items', description: 'Export current inventory stock levels and item details.' },
    { id: 'invoices', label: 'Invoices', description: 'Export historical invoice headers and totals.' }
  ];

  async function handleExport(table, format) {
    if (!organizationId) return;
    setExporting(`${table}-${format}`);
    
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('organization_id', organizationId);
        
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.info(`No data found for ${table}`);
        setExporting(null);
        return;
      }

      let content = '';
      let mimeType = '';
      let fileExtension = '';

      if (format === 'json') {
        content = JSON.stringify(data, null, 2);
        mimeType = 'application/json';
        fileExtension = 'json';
      } else if (format === 'csv') {
        content = Papa.unparse(data);
        mimeType = 'text/csv;charset=utf-8;';
        fileExtension = 'csv';
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${table}_export_${new Date().toISOString().split('T')[0]}.${fileExtension}`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success(`${table} exported successfully as ${format.toUpperCase()}`);
    } catch (err) {
      console.error(err);
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Data Export</h2>
        <p className="text-sm text-muted-foreground">Download your organization's data in CSV or JSON formats for external reporting or backups.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {EXPORTABLE_ENTITIES.map(entity => (
          <div key={entity.id} className="border rounded-lg p-5 bg-card flex flex-col">
            <h3 className="font-medium">{entity.label}</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4 flex-1">{entity.description}</p>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => handleExport(entity.id, 'csv')}
                disabled={exporting !== null}
              >
                {exporting === `${entity.id}-csv` ? (
                  <span className="flex items-center"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Exporting...</span>
                ) : (
                  <span className="flex items-center"><FileSpreadsheet className="mr-2 h-4 w-4" /> CSV</span>
                )}
              </Button>
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => handleExport(entity.id, 'json')}
                disabled={exporting !== null}
              >
                {exporting === `${entity.id}-json` ? (
                  <span className="flex items-center"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Exporting...</span>
                ) : (
                  <span className="flex items-center"><FileJson className="mr-2 h-4 w-4" /> JSON</span>
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
