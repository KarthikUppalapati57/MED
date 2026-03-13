import React, { useState } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function InvoiceEditor({ invoice, onChange }) {
  const [editingItem, setEditingItem] = useState(null);

  const handleFieldChange = (field, value) => {
    onChange({ ...invoice, [field]: value });
  };

  const handleLineItemChange = (index, field, value) => {
    const newItems = [...(invoice.line_items || [])];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Auto-calculate extended price
    if (field === 'quantity' || field === 'unit_price') {
      const qty = field === 'quantity' ? value : newItems[index].quantity || 0;
      const price = field === 'unit_price' ? value : newItems[index].unit_price || 0;
      newItems[index].extended_price = qty * price;
    }
    
    onChange({ ...invoice, line_items: newItems });
  };

  const addLineItem = () => {
    const newItems = [...(invoice.line_items || []), {
      product_id: '',
      description: '',
      quantity: 1,
      unit: 'ea',
      unit_price: 0,
      extended_price: 0
    }];
    onChange({ ...invoice, line_items: newItems });
    setEditingItem(newItems.length - 1);
  };

  const removeLineItem = (index) => {
    const newItems = invoice.line_items.filter((_, i) => i !== index);
    onChange({ ...invoice, line_items: newItems });
  };

  const calculateTotal = () => {
    return (invoice.line_items || []).reduce((sum, item) => sum + (item.extended_price || 0), 0);
  };

  return (
    <div className="space-y-6">
      {/* Invoice Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invoice Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Vendor Name</Label>
              <Input
                value={invoice.vendor_name || ''}
                onChange={(e) => handleFieldChange('vendor_name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Invoice Number</Label>
              <Input
                value={invoice.invoice_number || ''}
                onChange={(e) => handleFieldChange('invoice_number', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Invoice Date</Label>
              <Input
                type="date"
                value={invoice.invoice_date || ''}
                onChange={(e) => handleFieldChange('invoice_date', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={invoice.due_date || ''}
                onChange={(e) => handleFieldChange('due_date', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Terms</Label>
              <Input
                value={invoice.payment_terms || ''}
                onChange={(e) => handleFieldChange('payment_terms', e.target.value)}
                placeholder="e.g. Net 30"
              />
            </div>
            <div className="space-y-2">
              <Label>Tax Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={invoice.tax_amount || ''}
                onChange={(e) => handleFieldChange('tax_amount', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>Fuel Surcharge</Label>
              <Input
                type="number"
                step="0.01"
                value={invoice.fuel_surcharge || ''}
                onChange={(e) => handleFieldChange('fuel_surcharge', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>Delivery Fee</Label>
              <Input
                type="number"
                step="0.01"
                value={invoice.delivery_fee || ''}
                onChange={(e) => handleFieldChange('delivery_fee', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>Other Charges</Label>
              <Input
                type="number"
                step="0.01"
                value={invoice.other_charges || ''}
                onChange={(e) => handleFieldChange('other_charges', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>Total Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={invoice.total_amount || ''}
                onChange={(e) => handleFieldChange('total_amount', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Line Items</CardTitle>
          <Button onClick={addLineItem} size="sm" className="bg-teal-600 hover:bg-teal-700">
            <Plus className="h-4 w-4 mr-1" /> Add Item
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Product ID</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[80px]">Qty</TableHead>
                  <TableHead className="w-[80px]">Unit</TableHead>
                  <TableHead className="w-[100px]">Unit Price</TableHead>
                  <TableHead className="w-[100px]">Extended</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(invoice.line_items || []).map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Input
                        value={item.product_id || ''}
                        onChange={(e) => handleLineItemChange(index, 'product_id', e.target.value)}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.description || ''}
                        onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.quantity || ''}
                        onChange={(e) => handleLineItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.unit || ''}
                        onChange={(e) => handleLineItemChange(index, 'unit', e.target.value)}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.unit_price || ''}
                        onChange={(e) => handleLineItemChange(index, 'unit_price', parseFloat(e.target.value) || 0)}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      ${(item.extended_price || 0).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600"
                        onClick={() => removeLineItem(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!invoice.line_items || invoice.line_items.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-500 py-8">
                      No line items. Click "Add Item" to add products.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Totals */}
          <div className="mt-4 flex justify-end">
            <div className="w-72 space-y-2 bg-slate-50 rounded-lg p-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal:</span>
                <span className="font-medium">${calculateTotal().toFixed(2)}</span>
              </div>
              {(invoice.tax_amount > 0) && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Tax:</span>
                  <span className="font-medium">${(invoice.tax_amount || 0).toFixed(2)}</span>
                </div>
              )}
              {(invoice.fuel_surcharge > 0) && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Fuel Surcharge:</span>
                  <span className="font-medium">${(invoice.fuel_surcharge || 0).toFixed(2)}</span>
                </div>
              )}
              {(invoice.delivery_fee > 0) && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Delivery Fee:</span>
                  <span className="font-medium">${(invoice.delivery_fee || 0).toFixed(2)}</span>
                </div>
              )}
              {(invoice.other_charges > 0) && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Other Charges:</span>
                  <span className="font-medium">${(invoice.other_charges || 0).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold border-t pt-2">
                <span>Total:</span>
                <span className="text-teal-700">
                  ${(invoice.total_amount || (
                    calculateTotal() +
                    (invoice.tax_amount || 0) +
                    (invoice.fuel_surcharge || 0) +
                    (invoice.delivery_fee || 0) +
                    (invoice.other_charges || 0)
                  )).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}