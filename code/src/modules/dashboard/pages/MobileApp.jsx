import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { createPageUrl } from '@/utils';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from 'sonner';
import {
  Camera,
  CheckCircle2,
  ListTodo,
  ClipboardList,
  Home,
  UploadCloud,
  ChevronRight,
  PackageSearch,
} from 'lucide-react';

export default function MobileApp() {
  const { organization, brand, location, userProfile } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('home');
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);

  const activeBrandId = brand?.brand_id || brand?.id || location?.brand_id || userProfile?.brand_id || null;
  const activeLocationId = location?.id || userProfile?.location_id || null;

  const { data: inventoryItems = [] } = useAuthQuery({
    queryKey: ['mobile-count-inventory', organization?.id, activeLocationId],
    queryFn: () => api.entities.Inventory.list(null, {
      limit: 10,
      select: 'id, organization_id, brand_id, location_id, product_name, current_quantity, current_unit',
    }),
    enabled: !!organization?.id,
  });

  const { data: pendingInvoices = [] } = useAuthQuery({
    queryKey: ['mobile-approvals', organization?.id, activeLocationId],
    queryFn: async () => {
      const data = await api.entities.Invoice.list('-created_at', {
        limit: 20,
        select: 'id, organization_id, brand_id, location_id, invoice_number, vendor_name, total_amount, status, invoice_date, created_at',
      });
      return data.filter(inv => inv.status === 'pending_review' || inv.status === 'needs_review');
    },
    enabled: !!organization?.id,
  });

  const openPage = (pageName) => navigate(createPageUrl(pageName));

  const handleCreateInvoiceDraft = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!organization?.id) {
      toast.error('Organization context is required before creating an invoice draft.');
      return;
    }

    setIsCreatingInvoice(true);
    try {
      await api.entities.Invoice.create({
        organization_id: organization.id,
        brand_id: activeBrandId,
        location_id: activeLocationId,
        vendor_name: file.name.replace(/\.[^.]+$/, '') || 'Mobile invoice draft',
        invoice_number: `MOBILE-${Date.now()}`,
        invoice_date: new Date().toISOString().slice(0, 10),
        total_amount: 0,
        status: 'pending_review',
        payment_status: 'unpaid',
        source: 'mobile_app',
        line_items: [],
        validation_notes: `Created from mobile capture file: ${file.name}`,
      });
      toast.success('Invoice draft created. Complete extraction and review in Invoices.');
      openPage('Invoices');
    } catch (error) {
      toast.error(error.message || 'Failed to create invoice draft.');
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  const renderHome = () => (
    <div className="space-y-6">
      <div className="bg-brand text-primary-foreground p-6 rounded-b-3xl shadow-md -mx-4 -mt-4 mb-4">
        <h1 className="text-2xl font-bold">RestOps Mobile</h1>
        <p className="text-brand-foreground/80 text-sm mt-1">Floor Operations</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm hover:bg-slate-50 cursor-pointer active:scale-95 transition-transform" onClick={() => setActiveTab('snap')}>
          <CardContent className="p-4 flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
              <Camera className="w-6 h-6" />
            </div>
            <span className="font-semibold text-sm">Invoice Draft</span>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm hover:bg-slate-50 cursor-pointer active:scale-95 transition-transform" onClick={() => setActiveTab('approve')}>
          <CardContent className="p-4 flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 relative">
              <ListTodo className="w-6 h-6" />
              <span className="absolute -top-1 -right-1 bg-resend-red text-white text-[10px] min-w-5 h-5 px-1 flex items-center justify-center rounded-full">{pendingInvoices.length}</span>
            </div>
            <span className="font-semibold text-sm">Approvals</span>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm hover:bg-slate-50 cursor-pointer active:scale-95 transition-transform" onClick={() => setActiveTab('count')}>
          <CardContent className="p-4 flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
              <ClipboardList className="w-6 h-6" />
            </div>
            <span className="font-semibold text-sm">Inventory</span>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="font-bold mb-3">Recent Approval Work</h3>
        <div className="space-y-3">
          {pendingInvoices.slice(0, 2).map((invoice) => (
            <button key={invoice.id} type="button" onClick={() => openPage('Invoices')} className="w-full flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-slate-100 text-left">
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{invoice.vendor_name || 'Invoice'}</p>
                <p className="text-xs text-muted-foreground">Needs approval</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
          {pendingInvoices.length === 0 && (
            <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-100 text-sm text-muted-foreground">
              No recent approval activity.
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderSnap = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Invoice Draft</h2>
      </div>
      
      <div className="flex-1 bg-slate-900 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden mb-6 p-6 text-center">
        <div className="absolute inset-4 border-2 border-white/30 border-dashed rounded-xl" />
        <Camera className="w-16 h-16 text-white/50 relative" />
        <p className="relative mt-4 text-white/80 text-sm font-medium">Choose a receipt or invoice image to create a real review draft.</p>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleCreateInvoiceDraft} />
      <Button size="lg" className="w-full rounded-full h-14 bg-brand text-lg" disabled={isCreatingInvoice} onClick={() => fileInputRef.current?.click()}>
        <UploadCloud className="w-5 h-5 mr-2" /> {isCreatingInvoice ? 'Creating Draft' : 'Create Invoice Draft'}
      </Button>
    </div>
  );

  const renderApprove = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Pending Approvals</h2>
        <Badge variant="secondary">{pendingInvoices.length}</Badge>
      </div>

      <div className="space-y-4 overflow-y-auto pb-20">
        {pendingInvoices.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="font-medium">All caught up!</p>
          </div>
        ) : (
          pendingInvoices.map((inv) => (
            <Card key={inv.id} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold truncate">{inv.vendor_name || 'Vendor'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{inv.invoice_number || 'Draft'} - {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : 'No date'}</p>
                  <p className="text-lg font-bold text-brand mt-1">${Number(inv.total_amount || 0).toFixed(2)}</p>
                </div>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => openPage('Invoices')}>
                  Review
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );

  const renderCount = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Inventory Work</h2>
        <Badge className="bg-brand text-white">{location?.name || 'Active scope'}</Badge>
      </div>

      <div className="space-y-3 overflow-y-auto pb-20">
        {inventoryItems.slice(0, 10).map((item) => (
          <Card key={item.id} className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold truncate">{item.product_name || 'Inventory item'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">On hand: {Number(item.current_quantity || 0).toLocaleString()} {item.current_unit || 'units'}</p>
              </div>
              <PackageSearch className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
        {inventoryItems.length === 0 && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-sm text-muted-foreground">No inventory items found for this scope.</CardContent>
          </Card>
        )}
        <Button className="w-full rounded-full h-12" onClick={() => openPage('Inventory')}>
          Open Inventory Workflow
        </Button>
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto h-[800px] border-[8px] border-slate-900 rounded-[3rem] overflow-hidden relative shadow-2xl bg-slate-50 flex flex-col">
      <div className="h-7 w-full bg-brand flex justify-center items-center shrink-0">
        <div className="w-32 h-5 bg-slate-900 rounded-b-2xl absolute top-0"></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
        {activeTab === 'home' && renderHome()}
        {activeTab === 'snap' && renderSnap()}
        {activeTab === 'approve' && renderApprove()}
        {activeTab === 'count' && renderCount()}
      </div>

      <div className="h-20 bg-white border-t flex justify-around items-center px-6 pb-2 shrink-0">
        <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-brand font-bold' : 'text-muted-foreground'}`}>
          <Home className="w-6 h-6" />
          <span className="text-[10px]">Home</span>
        </button>
        <button onClick={() => setActiveTab('approve')} className={`flex flex-col items-center gap-1 ${activeTab === 'approve' ? 'text-brand font-bold' : 'text-muted-foreground'}`}>
          <div className="relative">
            <ListTodo className="w-6 h-6" />
            <span className="absolute -top-1 -right-1 bg-resend-red text-white text-[8px] min-w-3.5 h-3.5 px-0.5 flex items-center justify-center rounded-full">{pendingInvoices.length}</span>
          </div>
          <span className="text-[10px]">Approve</span>
        </button>
        <button onClick={() => setActiveTab('count')} className={`flex flex-col items-center gap-1 ${activeTab === 'count' ? 'text-brand font-bold' : 'text-muted-foreground'}`}>
          <ClipboardList className="w-6 h-6" />
          <span className="text-[10px]">Inventory</span>
        </button>
      </div>
    </div>
  );
}
