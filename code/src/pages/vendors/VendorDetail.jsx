import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Building2, MapPin, Mail, Phone, Sparkles, FileText, Activity } from 'lucide-react';

const VendorItemsTab = React.lazy(() => import('./VendorItemsTab'));
const OrderGuideTab = React.lazy(() => import('./OrderGuideTab'));
const CommunicationHub = React.lazy(() => import('./CommunicationHub'));
const AccountingControls = React.lazy(() => import('./AccountingControls'));
const AIVendorAnalyst = React.lazy(() => import('./AIVendorAnalyst'));
const DocumentVault = React.lazy(() => import('./DocumentVault'));
const VendorReconciliation = React.lazy(() => import('./VendorReconciliation'));
const VendorAuditTrail = React.lazy(() => import('./VendorAuditTrail'));
const VendorBulkTools = React.lazy(() => import('./VendorBulkTools'));
const VendorReceivingTab = React.lazy(() => import('./VendorReceivingTab'));

// Helper for unimplemented tabs linking out to master modules
const LinkedTabPlaceholder = ({ title, description, linkText, linkPath }) => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 bg-secondary/5 rounded-xl border border-dashed border-border/60">
      <div className="bg-primary/10 p-3 rounded-full mb-4">
        <FileText className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-muted-foreground text-sm text-center max-w-sm mb-6">{description}</p>
      <Button variant="outline" onClick={() => navigate(linkPath)}>{linkText}</Button>
    </div>
  );
};

const OverviewTab = () => (
  <div className="py-12 text-center text-muted-foreground">
    <Activity className="h-8 w-8 mx-auto mb-3 opacity-20" />
    <p>Comprehensive vendor overview dashboard is under construction.</p>
  </div>
);

const InvoicesTab = () => <LinkedTabPlaceholder title="AP Invoices" description="Manage and process this vendor's invoices from the centralized Accounts Payable hub." linkText="Go to AP Hub" linkPath="/Invoices" />;
const OrdersTab = () => <LinkedTabPlaceholder title="Vendor Orders" description="Create and track purchase orders for this vendor from the main Inventory module." linkText="Go to Orders" linkPath="/Orders" />;
const PaymentsTab = () => <LinkedTabPlaceholder title="Vendor Payments" description="Schedule and execute bill payments for this vendor from the centralized Bill Pay module." linkText="Go to Payments" linkPath="/Payments" />;

function VendorDetailTabFallback() {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
        Loading vendor section...
      </CardContent>
    </Card>
  );
}

function LazyVendorTab({ children }) {
  return (
    <React.Suspense fallback={<VendorDetailTabFallback />}>
      {children}
    </React.Suspense>
  );
}

export default function VendorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { organization, role, isPlatformAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  // Role based access control (UI locks)
  const isElevatedUser = isPlatformAdmin || role === 'org_owner' || role === 'admin';

  const { data: vendor, isLoading } = useAuthQuery({
    queryKey: ['vendor', id],
    queryFn: () => api.entities.Vendor.get(id),
    enabled: !!id,
  });



  const { data: vendorItems = [] } = useAuthQuery({
    queryKey: ['vendor_items_insights', id, vendor?.organization_id],
    queryFn: () => api.entities.VendorItem.filter({
      vendor_id: id,
      organization_id: vendor?.organization_id,
    }),
    enabled: !!id && !!vendor?.organization_id,
  });

  // Data-Driven Insights
  const aiSummary = React.useMemo(() => {
    if (!vendor) return [];
    const insights = [];

    // Payment setup
    if (!vendor.default_payment_account_id) {
      insights.push("This vendor is missing a default payment account setup.");
    }

    // Unpaid AP
    if (vendor.unpaid_ap > 0) {
      insights.push(`There is $${Number(vendor.unpaid_ap).toFixed(2)} in unpaid AP for this vendor.`);
    }

    // Item Insights
    if (vendorItems.length > 0) {
      const priceVariances = vendorItems.filter(i => i.price_variance_flag).length;
      const orderGuideCount = vendorItems.filter(i => i.on_order_guide).length;

      if (priceVariances > 0) {
        insights.push(`Prices increased on ${priceVariances} item(s) recently. Review recommended.`);
      }
      if (orderGuideCount === 0) {
        insights.push("No items have been added to the Order Guide yet.");
      }
    }

    if (insights.length === 0) {
      insights.push("Vendor is healthy. No immediate actions required.");
    }

    return insights;
  }, [vendor, vendorItems]);

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>Vendor not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/Vendors')}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header section */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/Vendors')} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{vendor.name}</h1>
            <Badge variant={vendor.status === 'active' ? 'default' : 'secondary'} className={vendor.status === 'active' ? 'bg-resend-green/10 text-resend-green hover:bg-resend-green/20' : ''}>
              {vendor.status}
            </Badge>
          </div>
          <p className="text-muted-foreground flex items-center gap-2 mt-1 text-sm">
            <Building2 className="h-4 w-4" /> Command Center
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Activity className="h-4 w-4 mr-2" /> View Health Score
          </Button>
          <Button>Create Order</Button>
        </div>
      </div>

      {/* AI Analyst Banner */}
      <Card className="border-primary/20 bg-primary/5 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
        <CardContent className="p-4 flex items-start gap-4">
          <div className="bg-primary/10 p-2 rounded-full mt-1">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              Vendor Analyst Insights
            </h3>
            <ul className="mt-2 space-y-1">
              {aiSummary.map((insight, idx) => (
                <li key={idx} className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/40 inline-block"></span>
                  {insight}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar: Profile & Metrics */}
        <div className="space-y-6">
          <Card className="shadow-sm border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-4 border-b border-border/40">
              <CardTitle className="text-lg">Vendor Profile</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {vendor.contact_name && (
                <div className="flex items-start gap-3">
                  <Mail className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="text-sm">
                    <p className="font-medium">{vendor.contact_name}</p>
                    <p className="text-muted-foreground">{vendor.email}</p>
                  </div>
                </div>
              )}
              {vendor.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{vendor.phone}</span>
                </div>
              )}
              {(vendor.city || vendor.state) && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{vendor.city}, {vendor.state} {vendor.zip_code}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>Terms: <span className="font-medium uppercase">{vendor.payment_terms?.replace('_', ' ')}</span></span>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-0">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Spend Metrics</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Spend</p>
                <p className="text-2xl font-bold text-foreground">${(vendor.total_spent || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/40">
                <div>
                  <p className="text-xs text-muted-foreground">This Period</p>
                  <p className="font-medium">$0.00</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Period</p>
                  <p className="font-medium">$0.00</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/40">
                <div>
                  <p className="text-xs text-muted-foreground">Open AP</p>
                  <p className="font-medium text-resend-red">$0.00</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Payment</p>
                  <p className="font-medium">14 days</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-3">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="border-b border-border mb-6 overflow-x-auto pb-px scrollbar-hide">
              <TabsList className="h-auto p-0 bg-transparent inline-flex whitespace-nowrap min-w-max">
                {['overview', 'items', 'order_guide', 'bulk_tools', 'invoices', 'orders', 'payments', 'receiving', 'reconciliation', 'vault', 'accounting', 'hub', 'ai_analyst', 'audit_trail'].map(tab => {
                  // UI Lock: Hide specific tabs from lower-level staff
                  if (!isElevatedUser && (tab === 'accounting' || tab === 'audit_trail' || tab === 'bulk_tools')) return null;
                  return (
                    <TabsTrigger 
                      key={tab}
                      value={tab} 
                      className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2.5 text-sm font-medium transition-colors capitalize"
                    >
                      {tab.replace('_', ' ')}
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </div>

            <TabsContent value="overview" className="mt-0 focus-visible:outline-none focus-visible:ring-0"><OverviewTab /></TabsContent>
            <TabsContent value="items" className="mt-0 focus-visible:outline-none focus-visible:ring-0"><LazyVendorTab><VendorItemsTab vendorId={id} /></LazyVendorTab></TabsContent>
            <TabsContent value="order_guide" className="mt-0 focus-visible:outline-none focus-visible:ring-0"><LazyVendorTab><OrderGuideTab vendorId={id} /></LazyVendorTab></TabsContent>
            {isElevatedUser && <TabsContent value="bulk_tools" className="mt-0 focus-visible:outline-none focus-visible:ring-0"><LazyVendorTab><VendorBulkTools vendorId={id} /></LazyVendorTab></TabsContent>}
            <TabsContent value="invoices" className="mt-0 focus-visible:outline-none focus-visible:ring-0"><InvoicesTab /></TabsContent>
            <TabsContent value="orders" className="mt-0 focus-visible:outline-none focus-visible:ring-0"><OrdersTab /></TabsContent>
            <TabsContent value="payments" className="mt-0 focus-visible:outline-none focus-visible:ring-0"><PaymentsTab /></TabsContent>
            <TabsContent value="receiving" className="mt-0 focus-visible:outline-none focus-visible:ring-0"><LazyVendorTab><VendorReceivingTab vendorId={id} /></LazyVendorTab></TabsContent>
            <TabsContent value="reconciliation" className="mt-0 focus-visible:outline-none focus-visible:ring-0"><LazyVendorTab><VendorReconciliation vendorId={id} /></LazyVendorTab></TabsContent>
            <TabsContent value="vault" className="mt-0 focus-visible:outline-none focus-visible:ring-0"><LazyVendorTab><DocumentVault vendorId={id} /></LazyVendorTab></TabsContent>
            {isElevatedUser && <TabsContent value="accounting" className="mt-0 focus-visible:outline-none focus-visible:ring-0"><LazyVendorTab><AccountingControls vendorId={id} /></LazyVendorTab></TabsContent>}
            <TabsContent value="hub" className="mt-0 focus-visible:outline-none focus-visible:ring-0"><LazyVendorTab><CommunicationHub vendorId={id} /></LazyVendorTab></TabsContent>
            <TabsContent value="ai_analyst" className="mt-0 focus-visible:outline-none focus-visible:ring-0"><LazyVendorTab><AIVendorAnalyst vendorId={id} /></LazyVendorTab></TabsContent>
            {isElevatedUser && <TabsContent value="audit_trail" className="mt-0 focus-visible:outline-none focus-visible:ring-0"><LazyVendorTab><VendorAuditTrail vendorId={id} /></LazyVendorTab></TabsContent>}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
