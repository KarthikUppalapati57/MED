import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, Edit2, Trash2, Link as LinkIcon, Loader2 } from 'lucide-react';
import { toast } from "sonner";

export default function VendorItemsTab({ vendorId }) {
  const { organization } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  const [formData, setFormData] = useState({
    vendor_item_name: '',
    vendor_item_code: '',
    vendor_unit: '',
    default_price: ''
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['vendor_items', vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_items')
        .select(`
          *,
          vendor_item_mappings (
            internal_product_id,
            products ( name )
          )
        `)
        .eq('vendor_id', vendorId)
        .eq('organization_id', organization?.id);
        
      if (error) throw error;
      return data || [];
    },
    enabled: !!vendorId && !!organization?.id
  });

  const createMutation = useMutation({
    mutationFn: async (newItem) => {
      const { data, error } = await supabase
        .from('vendor_items')
        .insert([{ ...newItem, vendor_id: vendorId, organization_id: organization?.id }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vendor_items', vendorId]);
      toast.success('Vendor item added');
      setDialogOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(`Failed to add item: ${err.message}`)
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }) => {
      const { data, error } = await supabase
        .from('vendor_items')
        .update(updates)
        .eq('id', id)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vendor_items', vendorId]);
      toast.success('Vendor item updated');
      setDialogOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(`Failed to update item: ${err.message}`)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('vendor_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vendor_items', vendorId]);
      toast.success('Vendor item deleted');
    }
  });

  const resetForm = () => {
    setFormData({ vendor_item_name: '', vendor_item_code: '', vendor_unit: '', default_price: '' });
    setEditingItem(null);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      vendor_item_name: item.vendor_item_name || '',
      vendor_item_code: item.vendor_item_code || '',
      vendor_unit: item.vendor_unit || '',
      default_price: item.default_price || ''
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.vendor_item_name) {
      toast.error('Item name is required');
      return;
    }
    const payload = {
      vendor_item_name: formData.vendor_item_name,
      vendor_item_code: formData.vendor_item_code,
      vendor_unit: formData.vendor_unit,
      default_price: formData.default_price ? parseFloat(formData.default_price) : null
    };

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, updates: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filteredItems = items.filter(item => 
    item.vendor_item_name?.toLowerCase().includes(search.toLowerCase()) ||
    item.vendor_item_code?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search items or codes..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card border-border/40"
          />
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-primary">
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </div>

      <div className="rounded-md border border-border/40 bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item Code</TableHead>
              <TableHead>Item Name</TableHead>
              <TableHead>Unit / Pack</TableHead>
              <TableHead>Default Price</TableHead>
              <TableHead>Mapped Product</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Loading items...
                </TableCell>
              </TableRow>
            ) : filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No vendor items found. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map(item => {
                const mapping = item.vendor_item_mappings?.[0];
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.vendor_item_code || '—'}</TableCell>
                    <TableCell className="font-medium">{item.vendor_item_name}</TableCell>
                    <TableCell>{item.vendor_unit || '—'}</TableCell>
                    <TableCell>${Number(item.default_price || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      {mapping?.products?.name ? (
                        <div className="flex items-center gap-2 text-sm text-resend-green">
                          <LinkIcon className="h-3 w-3" />
                          {mapping.products.name}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">Unmapped</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                          <Edit2 className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(item.id)}>
                          <Trash2 className="h-4 w-4 text-resend-red/70 hover:text-resend-red" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Vendor Item' : 'Add Vendor Item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Item Name *</Label>
              <Input 
                value={formData.vendor_item_name}
                onChange={e => setFormData({...formData, vendor_item_name: e.target.value})}
                placeholder="e.g. Fresh Atlantic Salmon 8oz"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vendor Item Code</Label>
                <Input 
                  value={formData.vendor_item_code}
                  onChange={e => setFormData({...formData, vendor_item_code: e.target.value})}
                  placeholder="SKU or Product Code"
                />
              </div>
              <div className="space-y-2">
                <Label>Unit / Packaging</Label>
                <Input 
                  value={formData.vendor_unit}
                  onChange={e => setFormData({...formData, vendor_unit: e.target.value})}
                  placeholder="e.g. 10lb Case"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Default Price ($)</Label>
              <Input 
                type="number"
                step="0.01"
                value={formData.default_price}
                onChange={e => setFormData({...formData, default_price: e.target.value})}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingItem ? 'Save Changes' : 'Add Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
