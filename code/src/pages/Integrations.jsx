import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Server, Database, Store, Link as LinkIcon, CheckCircle2, Lock, KeyRound, Loader2, CreditCard, Activity } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';

const INTEGRATION_TYPES = {
  MCP: 'mcp',
  POS: 'pos',
  ACCOUNTING: 'accounting'
};

const INTEGRATIONS = [
  {
    id: 'stripe',
    name: 'Stripe',
    type: INTEGRATION_TYPES.MCP,
    description: 'Payment processing and billing engine MCP',
    icon: CreditCard,
    color: 'indigo',
    connected: true, // Mock default
    fields: ['Secret Key', 'Publishable Key', 'Webhook Secret']
  },
  {
    id: 'supabase',
    name: 'Supabase',
    type: INTEGRATION_TYPES.MCP,
    description: 'Database and edge functions provider MCP',
    icon: Database,
    color: 'emerald',
    connected: true, // Mock default
    fields: ['Project URL', 'Service Role Key']
  },
  {
    id: 'cloudrun',
    name: 'Google Cloud Run',
    type: INTEGRATION_TYPES.MCP,
    description: 'Serverless execution environment MCP',
    icon: Server,
    color: 'blue',
    connected: false,
    fields: ['Project ID', 'Service Account JSON']
  },
  {
    id: 'toast',
    name: 'Toast POS',
    type: INTEGRATION_TYPES.POS,
    description: 'Restaurant point of sale integration',
    icon: Store,
    color: 'orange',
    connected: false,
    fields: ['Client ID', 'Client Secret', 'Restaurant GUID']
  },
  {
    id: 'square',
    name: 'Square',
    type: INTEGRATION_TYPES.POS,
    description: 'Retail and service POS system',
    icon: Store,
    color: 'slate',
    connected: false,
    fields: ['Application ID', 'Access Token', 'Location ID']
  },
  {
    id: '7shifts',
    name: '7shifts',
    type: INTEGRATION_TYPES.POS,
    description: 'Restaurant team management',
    icon: Activity,
    color: 'green',
    connected: false,
    fields: ['Company ID', 'API Access Token']
  },
  {
    id: 'clover',
    name: 'Clover',
    type: INTEGRATION_TYPES.POS,
    description: 'Cloud-based POS platform',
    icon: Store,
    color: 'emerald',
    connected: false,
    fields: ['Merchant ID', 'API Token']
  },
  {
    id: 'spoton',
    name: 'SpotOn',
    type: INTEGRATION_TYPES.POS,
    description: 'Hardware and software POS solutions',
    icon: Store,
    color: 'blue',
    connected: false,
    fields: ['App Key', 'Partner Key']
  },
  {
    id: 'quickbooks',
    name: 'QuickBooks Online',
    type: INTEGRATION_TYPES.ACCOUNTING,
    description: 'Cloud accounting and financial management',
    icon: Database,
    color: 'green',
    connected: false,
    fields: ['Client ID', 'Client Secret', 'Company ID']
  },
  {
    id: 'xero',
    name: 'Xero',
    type: INTEGRATION_TYPES.ACCOUNTING,
    description: 'Online accounting software',
    icon: Database,
    color: 'sky',
    connected: false,
    fields: ['Client ID', 'Client Secret', 'Tenant ID']
  },
  {
    id: 'sage',
    name: 'Sage Intacct',
    type: INTEGRATION_TYPES.ACCOUNTING,
    description: 'Advanced financial management',
    icon: Database,
    color: 'emerald',
    connected: false,
    fields: ['Sender ID', 'Sender Password', 'Company ID', 'User ID', 'User Password']
  }
];

export default function Integrations() {
  const [activeTab, setActiveTab] = useState(INTEGRATION_TYPES.MCP);
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [formValues, setFormValues] = useState({});

  const queryClient = useQueryClient();

  const { data: dbIntegrations = [] } = useAuthQuery({
    queryKey: ['integrations'],
    queryFn: () => api.entities.Integration.list(),
  });

  const getProviderKey = (id) => {
    const valid = ['quickbooks', 'xero', 'netsuite', 'stripe'];
    return valid.includes(id) ? id : 'other';
  };

  const isConnected = (integrationId) => {
    const dbInt = dbIntegrations.find(i => 
      (i.provider === integrationId) || 
      (i.provider === 'other' && i.metadata?.originalId === integrationId)
    );
    return dbInt?.is_active || false;
  };

  const openConnectDialog = (integration) => {
    setSelectedIntegration(integration);
    setFormValues({});
  };

  const handleConnect = async () => {
    setConnecting(true);
    const toastId = toast.loading(`Connecting to ${selectedIntegration.name}...`);
    
    try {
      await api.entities.Integration.create({
        provider: getProviderKey(selectedIntegration.id),
        metadata: { originalId: selectedIntegration.id, ...formValues },
        is_active: true
      });
      queryClient.invalidateQueries(['integrations']);
      toast.success(`${selectedIntegration.name} connected successfully`, { id: toastId });
    } catch (error) {
      toast.error(`Failed to connect: ${error.message}`, { id: toastId });
    } finally {
      setConnecting(false);
      setSelectedIntegration(null);
    }
  };

  const handleDisconnect = async (integrationId, name) => {
    const dbInt = dbIntegrations.find(i => 
      (i.provider === integrationId) || 
      (i.provider === 'other' && i.metadata?.originalId === integrationId)
    );
    if (dbInt) {
      try {
        await api.entities.Integration.delete(dbInt.id);
        queryClient.invalidateQueries(['integrations']);
        toast.success(`${name} disconnected`);
      } catch (error) {
        toast.error(`Failed to disconnect: ${error.message}`);
      }
    }
  };

  return (
    <div className="p-6 space-y-8 min-h-screen bg-secondary/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-200">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Integrations Hub</h1>
            <p className="text-sm text-muted-foreground mt-1">Connect your workspace to external platforms and MCP servers</p>
          </div>
        </div>
      </div>

      <Card className="border-emerald-100 bg-emerald-50/30 overflow-hidden relative">
        <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-400/10 blur-3xl rounded-full" />
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="relative flex items-center justify-center">
                <svg className="w-20 h-20 transform -rotate-90">
                  <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-emerald-100" />
                  <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray="226" strokeDashoffset="11" className="text-emerald-500" />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-emerald-700">95%</span>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Integration Health Score</h3>
                <p className="text-sm text-muted-foreground max-w-md">Your enterprise data sync is healthy. 1 connection requires re-authentication, but 95% of data streams (POS, Accounting, MCP) are flowing without errors.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="bg-white hover:bg-emerald-50">View Sync Logs</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center gap-4 border-b border-border mb-6">
          <button 
            onClick={() => setActiveTab(INTEGRATION_TYPES.MCP)}
            className={cn(
              "px-4 py-3 text-sm font-bold border-b-2 transition-all",
              activeTab === INTEGRATION_TYPES.MCP ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            MCP Servers (Infrastructure)
          </button>
          <button 
            onClick={() => setActiveTab(INTEGRATION_TYPES.POS)}
            className={cn(
              "px-4 py-3 text-sm font-bold border-b-2 transition-all",
              activeTab === INTEGRATION_TYPES.POS ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            POS Systems (Front-of-House)
          </button>
          <button 
            onClick={() => setActiveTab(INTEGRATION_TYPES.ACCOUNTING)}
            className={cn(
              "px-4 py-3 text-sm font-bold border-b-2 transition-all",
              activeTab === INTEGRATION_TYPES.ACCOUNTING ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Accounting Systems (Back-Office)
          </button>
        </div>

        <TabsContent value={INTEGRATION_TYPES.MCP} className="mt-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
             {INTEGRATIONS.filter(i => i.type === INTEGRATION_TYPES.MCP).map(renderIntegrationCard)}
           </div>
        </TabsContent>

        <TabsContent value={INTEGRATION_TYPES.POS} className="mt-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500">
           <div className="mb-6 p-4 rounded-2xl bg-amber-50/50 border border-amber-200 text-amber-800 flex items-start gap-3">
             <Lock className="w-5 h-5 shrink-0 text-amber-600" />
             <div>
               <p className="text-sm font-bold">Secure Webhook Endpoints</p>
               <p className="text-xs mt-1">When connecting a POS system, all inbound traffic is routed through our secure `pos-webhook` Edge Function edge network to guarantee payload authenticity.</p>
             </div>
           </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
             {INTEGRATIONS.filter(i => i.type === INTEGRATION_TYPES.POS).map(renderIntegrationCard)}
           </div>
        </TabsContent>

        <TabsContent value={INTEGRATION_TYPES.ACCOUNTING} className="mt-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500">
           <div className="mb-6 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200 text-indigo-800 flex items-start gap-3">
             <Lock className="w-5 h-5 shrink-0 text-indigo-600" />
             <div>
               <p className="text-sm font-bold">General Ledger Sync</p>
               <p className="text-xs mt-1">Connect your accounting software to automatically sync ledger bills, payments, and journal entries. All credentials are encrypted at rest.</p>
             </div>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
             {INTEGRATIONS.filter(i => i.type === INTEGRATION_TYPES.ACCOUNTING).map(renderIntegrationCard)}
           </div>
        </TabsContent>
      </Tabs>

      {/* Connection Dialog */}
      <Dialog open={!!selectedIntegration} onOpenChange={(open) => !open && setSelectedIntegration(null)}>
        {selectedIntegration && (
          <DialogContent className="max-w-md rounded-3xl border-none shadow-2xl p-8">
            <DialogHeader className="mb-6">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center mb-4",
                `bg-${selectedIntegration.color}-100 text-${selectedIntegration.color}-600`
              )}>
                <selectedIntegration.icon className="w-6 h-6" />
              </div>
              <DialogTitle className="text-2xl font-black">Connect {selectedIntegration.name}</DialogTitle>
              <DialogDescription>
                Enter your API credentials to establish a secure link.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {selectedIntegration.fields.map(field => (
                <div key={field}>
                  <Label className="text-xs font-bold text-foreground">{field}</Label>
                  <div className="relative mt-1.5">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      type={field.toLowerCase().includes('secret') || field.toLowerCase().includes('token') || field.toLowerCase().includes('key') ? 'password' : 'text'}
                      className="pl-9 bg-secondary/50 border-border h-11"
                      placeholder={`Enter ${field}`}
                      value={formValues[field] || ''}
                      onChange={e => setFormValues(prev => ({ ...prev, [field]: e.target.value }))}
                    />
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="mt-8 sm:justify-end gap-2">
              <Button variant="ghost" onClick={() => setSelectedIntegration(null)}>Cancel</Button>
              <Button 
                className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-6"
                onClick={handleConnect}
                disabled={connecting || selectedIntegration.fields.some(f => !formValues[f])}
              >
                {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-2" />}
                Establish Connection
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
