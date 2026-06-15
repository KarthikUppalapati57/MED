import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';
import { 
  Camera, 
  CheckCircle2, 
  ListTodo, 
  ClipboardList, 
  Home, 
  UploadCloud, 
  Search,
  ChevronRight
} from 'lucide-react';

export default function MobileApp() {
  const { organization } = useAuth();
  const [activeTab, setActiveTab] = useState('home');

  // Home View
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
            <span className="font-semibold text-sm">Snap Invoice</span>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm hover:bg-slate-50 cursor-pointer active:scale-95 transition-transform" onClick={() => setActiveTab('approve')}>
          <CardContent className="p-4 flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 relative">
              <ListTodo className="w-6 h-6" />
              <span className="absolute -top-1 -right-1 bg-resend-red text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full">3</span>
            </div>
            <span className="font-semibold text-sm">Approvals</span>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm hover:bg-slate-50 cursor-pointer active:scale-95 transition-transform" onClick={() => setActiveTab('count')}>
          <CardContent className="p-4 flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
              <ClipboardList className="w-6 h-6" />
            </div>
            <span className="font-semibold text-sm">Stock Count</span>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="font-bold mb-3">Recent Activity</h3>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-slate-100">
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-semibold">Sysco Delivery</p>
                <p className="text-xs text-muted-foreground">Uploaded 2 hours ago</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Snap Invoice View
  const renderSnap = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Snap Invoice</h2>
      </div>
      
      <div className="flex-1 bg-slate-900 rounded-2xl flex items-center justify-center relative overflow-hidden mb-6">
        <div className="absolute inset-4 border-2 border-white/30 border-dashed rounded-xl"></div>
        <Camera className="w-16 h-16 text-white/50" />
        <p className="absolute bottom-8 text-white/70 text-sm font-medium">Align edges within frame</p>
      </div>

      <Button size="lg" className="w-full rounded-full h-14 bg-brand text-lg" onClick={() => {
        toast.success('Invoice uploaded for OCR extraction!');
        setActiveTab('home');
      }}>
        <UploadCloud className="w-5 h-5 mr-2" /> Upload to RestOps
      </Button>
    </div>
  );

  // Approve View
  const { data: pendingInvoices = [] } = useAuthQuery({
    queryKey: ['mobile-approvals', organization?.id],
    queryFn: async () => {
      const data = await api.entities.Invoice.list();
      return data.filter(inv => inv.status === 'pending_review' || inv.status === 'needs_review');
    },
    enabled: !!organization?.id,
  });

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
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-bold">{inv.vendor_name || 'Vendor'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{inv.invoice_number} • {new Date(inv.invoice_date).toLocaleDateString()}</p>
                  <p className="text-lg font-bold text-brand mt-1">${Number(inv.total_amount).toFixed(2)}</p>
                </div>
                <Button size="icon" variant="ghost" className="rounded-full bg-slate-50 text-brand">
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );

  // Count View
  const renderCount = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Active Count</h2>
        <Badge className="bg-brand text-white">Walk-in Cooler</Badge>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search item to count..." className="pl-9 h-12 rounded-xl bg-white border-0 shadow-sm" />
      </div>

      <div className="space-y-3 overflow-y-auto pb-20">
        {['Roma Tomatoes', 'Chicken Breast (Raw)', 'Cheddar Cheese Block'].map((item, idx) => (
          <Card key={idx} className="border-0 shadow-sm overflow-hidden">
            <div className="flex">
              <div className="flex-1 p-4">
                <p className="font-bold">{item}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Expected: {Math.floor(Math.random() * 20) + 5} lbs</p>
              </div>
              <div className="w-24 bg-brand/5 border-l border-brand/10 p-3 flex flex-col justify-center">
                <Input 
                  type="number" 
                  placeholder="0.0" 
                  className="h-10 text-center font-bold text-lg border-brand/20 focus-visible:ring-brand bg-white"
                />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto h-[800px] border-[8px] border-slate-900 rounded-[3rem] overflow-hidden relative shadow-2xl bg-slate-50 flex flex-col">
      {/* Mobile Status Bar Mock */}
      <div className="h-7 w-full bg-brand flex justify-center items-center shrink-0">
        <div className="w-32 h-5 bg-slate-900 rounded-b-2xl absolute top-0"></div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
        {activeTab === 'home' && renderHome()}
        {activeTab === 'snap' && renderSnap()}
        {activeTab === 'approve' && renderApprove()}
        {activeTab === 'count' && renderCount()}
      </div>

      {/* Bottom Nav */}
      <div className="h-20 bg-white border-t flex justify-around items-center px-6 pb-2 shrink-0">
        <button 
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-brand font-bold' : 'text-muted-foreground'}`}
        >
          <Home className="w-6 h-6" />
          <span className="text-[10px]">Home</span>
        </button>
        <button 
          onClick={() => setActiveTab('approve')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'approve' ? 'text-brand font-bold' : 'text-muted-foreground'}`}
        >
          <div className="relative">
            <ListTodo className="w-6 h-6" />
            <span className="absolute -top-1 -right-1 bg-resend-red text-white text-[8px] w-3.5 h-3.5 flex items-center justify-center rounded-full">3</span>
          </div>
          <span className="text-[10px]">Approve</span>
        </button>
        <button 
          onClick={() => setActiveTab('count')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'count' ? 'text-brand font-bold' : 'text-muted-foreground'}`}
        >
          <ClipboardList className="w-6 h-6" />
          <span className="text-[10px]">Count</span>
        </button>
      </div>
    </div>
  );
}
