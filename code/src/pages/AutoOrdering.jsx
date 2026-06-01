import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import {
  ShoppingCart,
  Send,
  Check,
  X,
  MessageCircle,
  Cloud,
  Calendar,
  AlertCircle,
  Loader2,
  Mail,
  MessageSquare,
  Sparkles,
  FileText,
  ArrowRightLeft,
  Package
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";


import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_COLORS = {
  pending_approval: 'bg-resend-orange/10 text-resend-orange',
  approved: 'bg-resend-green/10 text-resend-green',
  sent: 'bg-resend-blue/10 text-resend-blue',
  cancelled: 'bg-resend-red/10 text-resend-red',
  received: 'bg-resend-green/10 text-resend-green',
};

export default function AutoOrdering() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'all-orders';
  const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [chatMessage, setChatMessage] = useState('');
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendMethod, setSendMethod] = useState('email');

  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useAuthQuery({
    queryKey: ['auto-orders'],
    queryFn: () => api.entities.AutoOrder.list('-created_at'),
  });

  useEffect(() => {
    const channel = supabase.channel('auto-orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auto_orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['auto-orders'] });
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: inventory = [] } = useAuthQuery({
    queryKey: ['inventory'],
    queryFn: () => api.entities.Inventory.list(),
  });

  const { data: vendors = [] } = useAuthQuery({
    queryKey: ['vendors'],
    queryFn: () => api.entities.Vendor.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.entities.AutoOrder.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-orders'] });
      toast.success('Order created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.AutoOrder.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-orders'] });
    },
  });

  // Generate order based on inventory levels
  const generateOrder = async () => {
    setGenerating(true);
    try {
      // Find items at or below reorder point (threshold)
      const lowItems = inventory.filter(i => 
        i.reorder_point != null
          ? (i.current_quantity || 0) <= i.reorder_point
          : (i.current_quantity || 0) < (i.par_level || 10)
      );

      if (lowItems.length === 0) {
        toast.info('All items are at or above par level');
        setGenerating(false);
        return;
      }

      // Simple, local suggestion generation without external AI
      const generatedSuggestions = lowItems.map((item) => ({
        type: 'threshold',
        description: `Consider reordering ${item.product_name} to reach par level.`,
        impact: `Current ${item.current_quantity || 0}, par ${item.par_level || 10}.`,
      }));

      setSuggestions(generatedSuggestions);

      // Group items by vendor (simplified - in real app would match products to vendors)
      const orderItems = lowItems.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        current_stock: item.current_quantity || 0,
        par_level: item.par_level || 10,
        suggested_quantity: (item.par_level || 10) - (item.current_quantity || 0),
        approved_quantity: (item.par_level || 10) - (item.current_quantity || 0),
        unit: item.current_unit || 'ea',
        unit_price: item.unit_cost || 0,
        total_price: ((item.par_level || 10) - (item.current_quantity || 0)) * (item.unit_cost || 0)
      }));

      const order = {
        order_number: `ORD-${Date.now()}`,
        vendor_name: 'Multiple Vendors',
        status: 'pending_approval',
        items: orderItems,
        total_amount: orderItems.reduce((sum, i) => sum + i.total_price, 0),
        external_suggestions: generatedSuggestions,
        chat_history: []
      };

      await createMutation.mutateAsync(order);
      toast.success('Order generated based on inventory levels');
    } catch (error) {
      toast.error('Failed to generate order');
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async (order) => {
    await updateMutation.mutateAsync({
      id: order.id,
      data: { 
        status: 'approved',
        approved_date: new Date().toISOString()
      }
    });
    toast.success('Order approved');
  };

  const handleReject = async (order) => {
    await updateMutation.mutateAsync({
      id: order.id,
      data: { status: 'cancelled' }
    });
    toast.success('Order cancelled');
  };

  const handleSendOrder = async () => {
    if (!selectedOrder) return;

    await updateMutation.mutateAsync({
      id: selectedOrder.id,
      data: { 
        status: 'sent',
        sent_via: sendMethod
      }
    });

    // In real app, would send email/WhatsApp to vendor
    toast.success(`Order sent via ${sendMethod}`);
    setSendDialogOpen(false);
    setSelectedOrder(null);
  };

  const handleChatSubmit = async () => {
    if (!chatMessage.trim() || !selectedOrder) return;

    const newHistory = [
      ...(selectedOrder.chat_history || []),
      { role: 'user', message: chatMessage, timestamp: new Date().toISOString() }
    ];

    newHistory.push({ 
      role: 'assistant', 
      message: 'Thanks, your request has been noted. Please adjust quantities directly in the table as needed.',
      timestamp: new Date().toISOString()
    });

    // Apply suggested changes if any
    let updatedItems = [...selectedOrder.items];
    // No automatic changes without a configured AI backend

    await updateMutation.mutateAsync({
      id: selectedOrder.id,
      data: { 
        chat_history: newHistory,
        items: updatedItems,
        total_amount: updatedItems.reduce((sum, i) => sum + i.total_price, 0)
      }
    });

    setSelectedOrder({
      ...selectedOrder,
      chat_history: newHistory,
      items: updatedItems
    });
    setChatMessage('');
  };

  const pendingOrders = React.useMemo(() => orders.filter(o => o.status === 'pending_approval'), [orders]);
  const approvedOrders = React.useMemo(() => orders.filter(o => o.status === 'approved'), [orders]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Orders</h1>
          <p className="text-muted-foreground mt-1">Manage purchase orders and vendor communications</p>
        </div>
        <Button 
          onClick={generateOrder} 
          disabled={generating}
          className="bg-primary hover:bg-primary"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          Generate Order
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 mb-6">
          <TabsTrigger value="all-orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="place-order">Place Order</TabsTrigger>
          <TabsTrigger value="invoice-approval">Invoice Approval</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="receiving">Receiving</TabsTrigger>
          <TabsTrigger value="order-setup">Settings</TabsTrigger>
        </TabsList>
        {/* â”€â”€ All Orders Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <TabsContent value="all-orders">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">All Orders</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Loading orders...
                      </TableCell>
                    </TableRow>
                  ) : orders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No orders yet. Generate one from the "Place New Order" tab.
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map(order => {
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium font-mono">{order.order_number}</TableCell>
                          <TableCell>{order.vendor_name}</TableCell>
                          <TableCell>{order.items?.length || 0} items</TableCell>
                          <TableCell className="font-semibold">${order.total_amount?.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLORS[order.status] || 'bg-secondary text-foreground'}>
                              {order.status?.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {order.created_at ? new Date(order.created_at).toLocaleDateString() : 'â€”'}
                          </TableCell>
                          <TableCell>
                            {order.status === 'pending_approval' && (
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleApprove(order)}>
                                  <Check className="h-3 w-3 mr-1" /> Approve
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs text-resend-red" onClick={() => handleReject(order)}>
                                  <X className="h-3 w-3 mr-1" /> Reject
                                </Button>
                              </div>
                            )}
                            {order.status === 'approved' && (
                              <Button size="sm" className="h-7 text-xs bg-primary" onClick={() => { setSelectedOrder(order); setSendDialogOpen(true); }}>
                                <Send className="h-3 w-3 mr-1" /> Send
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* â”€â”€ Place New Order Tab (existing content) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <TabsContent value="place-order" className="space-y-6">

      {/* External Suggestions */}
      {suggestions.length > 0 && (
        <Card className="border-0 shadow-sm bg-gradient-to-r from-background to-cyan-50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {suggestions.map((s, idx) => (
                <div key={s.id || `suggestion-${idx}`} className="flex items-start gap-3 p-3 bg-card/50 rounded-lg">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    {s.type === 'weather' ? <Cloud className="h-4 w-4 text-primary" /> :
                     s.type === 'holiday' ? <Calendar className="h-4 w-4 text-primary" /> :
                     <AlertCircle className="h-4 w-4 text-primary" />}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{s.description}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{s.impact}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Orders */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Pending Approval ({pendingOrders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No orders pending approval. Generate one based on inventory levels.
            </div>
          ) : (
            <div className="space-y-4">
              {pendingOrders.map((order) => (
                <div key={order.id} className="border rounded-lg overflow-hidden">
                  <div className="p-4 bg-secondary flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{order.order_number}</p>
                      <p className="text-sm text-muted-foreground">{order.vendor_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">${order.total_amount?.toFixed(2)}</span>
                      <Badge className="bg-resend-orange/10 text-resend-orange">Pending</Badge>
                    </div>
                  </div>
                  
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>Par</TableHead>
                        <TableHead>Suggested</TableHead>
                        <TableHead>Approved</TableHead>
                        <TableHead>Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.items?.slice(0, 5).map((item, idx) => (
                        <TableRow key={item.product_id || item.product_name || idx}>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell>{item.current_stock}</TableCell>
                          <TableCell>{item.par_level}</TableCell>
                          <TableCell>{item.suggested_quantity}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              defaultValue={item.approved_quantity}
                              onBlur={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                if (val === item.approved_quantity) return;

                                const newItems = [...order.items];
                                newItems[idx] = {
                                  ...newItems[idx],
                                  approved_quantity: val,
                                  total_price: val * newItems[idx].unit_price,
                                };

                                updateMutation.mutate({
                                  id: order.id,
                                  data: { 
                                    items: newItems,
                                    total_amount: newItems.reduce((s, i) => s + i.total_price, 0)
                                  }
                                });
                              }}
                              className="w-20 h-8"
                            />
                          </TableCell>
                          <TableCell>${item.total_price?.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="p-4 bg-secondary flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Chat to Revise
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReject(order)}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="bg-resend-green hover:bg-green-700"
                        onClick={() => handleApprove(order)}
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approved Orders */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Approved Orders ({approvedOrders.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvedOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No approved orders
                  </TableCell>
                </TableRow>
              ) : (
                approvedOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.order_number}</TableCell>
                    <TableCell>{order.vendor_name}</TableCell>
                    <TableCell>{order.items?.length} items</TableCell>
                    <TableCell className="font-semibold">${order.total_amount?.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge className="bg-resend-green/10 text-resend-green">Approved</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedOrder(order);
                          setSendDialogOpen(true);
                        }}
                        className="bg-primary hover:bg-primary"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Send
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>

        {/* â”€â”€ Invoice Approval Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <TabsContent value="invoice-approval">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-5 w-5" /> Invoice Approval Queue
              </CardTitle>
              <p className="text-xs text-muted-foreground">Match received invoices against purchase orders for approval</p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>PO Reference</TableHead>
                    <TableHead>Invoice Total</TableHead>
                    <TableHead>PO Total</TableHead>
                    <TableHead>Variance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.filter(o => o.status === 'sent' || o.status === 'received').length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No invoices pending approval. Invoices will appear here once orders are sent and invoices received.
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.filter(o => o.status === 'sent' || o.status === 'received').map(order => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono text-sm">INV-{order.order_number?.replace('ORD-', '')}</TableCell>
                        <TableCell className="font-medium">{order.vendor_name}</TableCell>
                        <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                        <TableCell className="font-semibold">${order.total_amount?.toFixed(2)}</TableCell>
                        <TableCell>${order.total_amount?.toFixed(2)}</TableCell>
                        <TableCell><Badge className="bg-resend-green/10 text-resend-green">$0.00</Badge></TableCell>
                        <TableCell><Badge className="bg-resend-yellow/10 text-resend-yellow">Pending Review</Badge></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* â”€â”€ Order Setup Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <TabsContent value="order-setup">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Approval Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Require Manager Approval</p>
                    <p className="text-sm text-muted-foreground">Orders above threshold need manager sign-off</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Approval Threshold</p>
                    <p className="text-sm text-muted-foreground">Orders above this amount need approval</p>
                  </div>
                  <Input className="w-28" type="number" step="100" defaultValue="500" />
                </div>
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Auto-Approve Below Threshold</p>
                    <p className="text-sm text-muted-foreground">Automatically approve small orders</p>
                  </div>
                  <Switch />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Email & Delivery Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Send Order Confirmation</p>
                    <p className="text-sm text-muted-foreground">Email order details to manager after approval</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Default Send Method</p>
                    <p className="text-sm text-muted-foreground">Default channel for vendor orders</p>
                  </div>
                  <Badge className="bg-primary/10 text-primary">Email</Badge>
                </div>
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Recurring Orders</p>
                    <p className="text-sm text-muted-foreground">Set up automatic recurring order schedules</p>
                  </div>
                  <Badge variant="secondary">Not Configured</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Transfers Tab ────────────────────────────────────────────────────────── */}
        <TabsContent value="transfers">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5" /> Internal Transfers
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Move inventory between your store locations</p>
              </div>
              <Button size="sm" className="bg-primary hover:bg-primary">New Transfer</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transfer ID</TableHead>
                    <TableHead>From Location</TableHead>
                    <TableHead>To Location</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No active transfers.
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Receiving Tab ────────────────────────────────────────────────────────── */}
        <TabsContent value="receiving">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-5 w-5" /> Receiving Log
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Track physical deliveries against Purchase Orders</p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receiving ID</TableHead>
                    <TableHead>PO Reference</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Received Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No receiving logs found.
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Chat Dialog */}
      <Dialog open={!!selectedOrder && !sendDialogOpen} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Revise Order - {selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          
          <div className="h-64 overflow-y-auto border rounded-lg p-4 space-y-3">
            {(selectedOrder?.chat_history || []).map((msg, idx) => (
              <div
                key={msg.timestamp || idx}
                className={cn(
                  "p-3 rounded-lg max-w-[80%]",
                  msg.role === 'user' 
                    ? "bg-primary/10 ml-auto" 
                    : "bg-secondary"
                )}
              >
                <p className="text-sm">{msg.message}</p>
              </div>
            ))}
            {(selectedOrder?.chat_history || []).length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Ask me to adjust quantities, add items, or make changes to the order
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Ask to adjust the order..."
              onKeyDown={(e) => e.key === 'Enter' && handleChatSubmit()}
            />
            <Button onClick={handleChatSubmit} className="bg-primary hover:bg-primary">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Order to Vendor</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Choose how to send this order to the vendor
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setSendMethod('email')}
                className={cn(
                  "p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-all",
                  sendMethod === 'email' ? "border-primary bg-primary/5" : "border-border"
                )}
              >
                <Mail className="h-8 w-8 text-primary" />
                <span className="font-medium">Email</span>
              </button>
              <button
                onClick={() => setSendMethod('whatsapp')}
                className={cn(
                  "p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-all",
                  sendMethod === 'whatsapp' ? "border-primary bg-primary/5" : "border-border"
                )}
              >
                <MessageSquare className="h-8 w-8 text-resend-green" />
                <span className="font-medium">WhatsApp</span>
              </button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSendOrder} className="bg-primary hover:bg-primary">
              Send Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
