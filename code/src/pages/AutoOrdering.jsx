import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import {
  ShoppingCart,
  Send,
  Check,
  X,
  Edit2,
  MessageCircle,
  Cloud,
  Calendar,
  AlertCircle,
  Loader2,
  RefreshCw,
  Mail,
  MessageSquare,
  Sparkles
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function AutoOrdering() {
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [chatMessage, setChatMessage] = useState('');
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendMethod, setSendMethod] = useState('email');

  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['auto-orders'],
    queryFn: () => base44.entities.AutoOrder.list('-created_date'),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => base44.entities.Inventory.list(),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.AutoOrder.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-orders'] });
      toast.success('Order created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.AutoOrder.update(id, data),
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

      // Get external suggestions from AI
      const aiResponse = await base44.integrations.Core.InvokeLLM({
        prompt: `Based on the following low inventory items, suggest any adjustments considering:
        - Current weather patterns
        - Upcoming holidays
        - Seasonal trends
        
        Items: ${JSON.stringify(lowItems.map(i => ({
          name: i.product_name,
          current: i.current_quantity,
          par: i.par_level
        })))}
        
        Return suggestions for ordering adjustments.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  description: { type: "string" },
                  impact: { type: "string" }
                }
              }
            }
          }
        }
      });

      setSuggestions(aiResponse?.suggestions || []);

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
        external_suggestions: aiResponse?.suggestions || [],
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

    // Get AI response
    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: `You are helping adjust a purchase order. The user says: "${chatMessage}"
      
      Current order items: ${JSON.stringify(selectedOrder.items)}
      
      Suggest any changes to quantities or items based on the user's request.`,
      response_json_schema: {
        type: "object",
        properties: {
          response: { type: "string" },
          suggested_changes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                product_name: { type: "string" },
                new_quantity: { type: "number" }
              }
            }
          }
        }
      }
    });

    newHistory.push({ 
      role: 'assistant', 
      message: aiResponse?.response || 'I understand. Let me help adjust the order.',
      timestamp: new Date().toISOString()
    });

    // Apply suggested changes if any
    let updatedItems = [...selectedOrder.items];
    if (aiResponse?.suggested_changes) {
      aiResponse.suggested_changes.forEach(change => {
        const idx = updatedItems.findIndex(i => i.product_name === change.product_name);
        if (idx !== -1) {
          updatedItems[idx] = {
            ...updatedItems[idx],
            approved_quantity: change.new_quantity,
            total_price: change.new_quantity * updatedItems[idx].unit_price
          };
        }
      });
    }

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

  const pendingOrders = orders.filter(o => o.status === 'pending_approval');
  const approvedOrders = orders.filter(o => o.status === 'approved');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auto Ordering</h1>
          <p className="text-slate-500 mt-1">AI-powered order suggestions based on inventory</p>
        </div>
        <Button 
          onClick={generateOrder} 
          disabled={generating}
          className="bg-teal-600 hover:bg-teal-700"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          Generate Order
        </Button>
      </div>

      {/* External Suggestions */}
      {suggestions.length > 0 && (
        <Card className="border-0 shadow-sm bg-gradient-to-r from-teal-50 to-cyan-50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-teal-600" />
              AI Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {suggestions.map((s, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-white/50 rounded-lg">
                  <div className="h-8 w-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                    {s.type === 'weather' ? <Cloud className="h-4 w-4 text-teal-600" /> :
                     s.type === 'holiday' ? <Calendar className="h-4 w-4 text-teal-600" /> :
                     <AlertCircle className="h-4 w-4 text-teal-600" />}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{s.description}</p>
                    <p className="text-sm text-slate-500 mt-0.5">{s.impact}</p>
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
            <div className="text-center py-8 text-slate-500">
              No orders pending approval. Generate one based on inventory levels.
            </div>
          ) : (
            <div className="space-y-4">
              {pendingOrders.map((order) => (
                <div key={order.id} className="border rounded-lg overflow-hidden">
                  <div className="p-4 bg-slate-50 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{order.order_number}</p>
                      <p className="text-sm text-slate-500">{order.vendor_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">${order.total_amount?.toFixed(2)}</span>
                      <Badge className="bg-orange-100 text-orange-700">Pending</Badge>
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
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell>{item.current_stock}</TableCell>
                          <TableCell>{item.par_level}</TableCell>
                          <TableCell>{item.suggested_quantity}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.approved_quantity}
                              onChange={(e) => {
                                const newItems = [...order.items];
                                newItems[idx].approved_quantity = parseFloat(e.target.value) || 0;
                                newItems[idx].total_price = newItems[idx].approved_quantity * newItems[idx].unit_price;
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

                  <div className="p-4 bg-slate-50 flex items-center justify-between">
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
                        className="bg-green-600 hover:bg-green-700"
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
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
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
                      <Badge className="bg-green-100 text-green-700">Approved</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedOrder(order);
                          setSendDialogOpen(true);
                        }}
                        className="bg-teal-600 hover:bg-teal-700"
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

      {/* Chat Dialog */}
      <Dialog open={!!selectedOrder && !sendDialogOpen} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Revise Order - {selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          
          <div className="h-64 overflow-y-auto border rounded-lg p-4 space-y-3">
            {(selectedOrder?.chat_history || []).map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "p-3 rounded-lg max-w-[80%]",
                  msg.role === 'user' 
                    ? "bg-teal-100 ml-auto" 
                    : "bg-slate-100"
                )}
              >
                <p className="text-sm">{msg.message}</p>
              </div>
            ))}
            {(selectedOrder?.chat_history || []).length === 0 && (
              <p className="text-center text-slate-400 py-8">
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
            <Button onClick={handleChatSubmit} className="bg-teal-600 hover:bg-teal-700">
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
            <p className="text-sm text-slate-500">
              Choose how to send this order to the vendor
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setSendMethod('email')}
                className={cn(
                  "p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-all",
                  sendMethod === 'email' ? "border-teal-500 bg-teal-50" : "border-slate-200"
                )}
              >
                <Mail className="h-8 w-8 text-teal-600" />
                <span className="font-medium">Email</span>
              </button>
              <button
                onClick={() => setSendMethod('whatsapp')}
                className={cn(
                  "p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-all",
                  sendMethod === 'whatsapp' ? "border-teal-500 bg-teal-50" : "border-slate-200"
                )}
              >
                <MessageSquare className="h-8 w-8 text-green-600" />
                <span className="font-medium">WhatsApp</span>
              </button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSendOrder} className="bg-teal-600 hover:bg-teal-700">
              Send Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}