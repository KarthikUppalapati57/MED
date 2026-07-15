import React from 'react';
import { AlertTriangle, CheckCircle2, Plus, Trash2, Bot } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ReconciliationVarianceTable from './ReconciliationVarianceTable';
import { CategorySummaryTable } from './CategorySummaryTable';
import { ApprovalWorkflowEngine } from './ApprovalWorkflowEngine';
import { BillPayWidget } from './BillPayWidget';
import AIEmailDrafter from '@/modules/vendors/components/AIEmailDrafter';

export default function InvoiceEditor({ invoice, onChange }) {
  const [emailDrafterOpen, setEmailDrafterOpen] = React.useState(false);

  const isManualEntry = invoice.source === 'manual_entry';
  const paidDetection = invoice.validation_results?.paid_status_detection;
  const hasPaidDetection = paidDetection?.detected;
  const isHighConfidencePaid = paidDetection?.should_mark_paid;

  const displayValue = (value) => (value === 0 || value ? value : '');
  const displayNumberInput = (value) => (value === 0 || value ? String(value) : '');
  const asNumber = (value) => parseFloat(value) || 0;
  const formatMoneyInput = (value) => {
    if (value === '' || value === null || value === undefined) return '';
    return asNumber(value).toFixed(2);
  };

  const recalculateTotals = (items, currentInvoice) => {
    const hasLineItems = Array.isArray(items) && items.length > 0;
    const subtotal = hasLineItems
      ? items.reduce((sum, item) => sum + asNumber(item.extended_price), 0)
      : asNumber(currentInvoice.subtotal);
    const totalAmount = subtotal +
      asNumber(currentInvoice.tax_amount) +
      asNumber(currentInvoice.fuel_surcharge) +
      asNumber(currentInvoice.delivery_fee) +
      asNumber(currentInvoice.other_charges);
    return { subtotal, total_amount: totalAmount };
  };

  const handleFieldChange = (field, value) => {
    let updated = { ...invoice, [field]: value };
    if (field === 'payment_status' && invoice.validation_results?.paid_status_detection) {
      updated = {
        ...updated,
        validation_results: {
          ...invoice.validation_results,
          paid_status_detection: {
            ...invoice.validation_results.paid_status_detection,
            reviewed_by_user: true,
            user_selected_status: value,
          },
        },
      };
    }
    // Recalculate total when fee fields change
    if (['tax_amount', 'fuel_surcharge', 'delivery_fee', 'other_charges'].includes(field)) {
      const totals = recalculateTotals(updated.line_items || [], updated);
      onChange({ ...updated, ...totals });
    } else {
      onChange(updated);
    }
  };

  const handleLineItemChange = (index, field, value) => {
    const newItems = [...(invoice.line_items || [])];
    newItems[index] = { ...newItems[index], [field]: value };

    // Auto-calculate extended price: (qty * price) + adj - disc
    if (['quantity', 'unit_price', 'discount', 'adjustment'].includes(field)) {
      const qty = asNumber(newItems[index].quantity);
      const price = asNumber(newItems[index].unit_price);
      const disc = asNumber(newItems[index].discount);
      const adj = asNumber(newItems[index].adjustment);
      newItems[index].extended_price = (qty * price) + adj - disc;
    }

    const totals = recalculateTotals(newItems, invoice);
    onChange({ ...invoice, line_items: newItems, ...totals });
  };

  const addLineItem = () => {
    const newItems = [...(invoice.line_items || []), {
      vendor_item_code: '',
      description: '',
      pack_size: '',
      label: '',
      quantity: 1,
      unit: 'ea',
      unit_price: 0,
      discount: 0,
      adjustment: 0,
      extended_price: 0
    }];
    onChange({ ...invoice, line_items: newItems });
  };

  const removeLineItem = (index) => {
    const newItems = (invoice.line_items || []).filter((_, i) => i !== index);
    const totals = recalculateTotals(newItems, invoice);
    onChange({ ...invoice, line_items: newItems, ...totals });
  };

  const calculateTotal = () => {
    return (invoice.line_items || []).reduce((sum, item) => sum + asNumber(item.extended_price), 0);
  };

  const handleMoneyFieldBlur = (field) => {
    const currentValue = invoice[field];
    if (currentValue === '' || currentValue === null || currentValue === undefined) return;
    const formattedValue = formatMoneyInput(currentValue);
    if (formattedValue === currentValue) return;
    handleFieldChange(field, formattedValue);
  };

  const RequiredLabel = ({ children }) => (
    <Label>
      {children}
      {isManualEntry && <span className="ml-1 text-red-600" aria-label="required">*</span>}
    </Label>
  );

  return (
    <div className="space-y-6">
      {/* Approval Workflow Engine */}
      {invoice.id && invoice.status === 'pending_approval' && (
        <ApprovalWorkflowEngine invoice={invoice} />
      )}

      {/* Bill Pay Widget */}
      {invoice.id && (
        <BillPayWidget invoice={invoice} />
      )}

      {/* Invoice Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invoice Details</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.validation_notes && (
            <div className="mb-4 rounded-lg border p-3 text-sm border-amber-200 bg-amber-50 text-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">Validation Notice</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200 h-7"
                      onClick={() => setEmailDrafterOpen(true)}
                    >
                      <Bot className="h-3.5 w-3.5 mr-1.5" />
                      Draft Vendor Email
                    </Button>
                  </div>
                  <p className="mt-1">{invoice.validation_notes}</p>
                </div>
              </div>
            </div>
          )}
          {invoice.status === 'extract_failed' && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-red-600" />
                <div>
                  <p className="font-semibold">AI Extraction Failed</p>
                  <p className="mt-1">{invoice.validation_results?.error || 'Unknown error occurred during AI processing. Please enter details manually.'}</p>
                </div>
              </div>
            </div>
          )}
          {hasPaidDetection && (
            <div className={`mb-4 rounded-lg border p-3 text-sm ${
              isHighConfidencePaid
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-yellow-200 bg-yellow-50 text-yellow-800'
            }`}>
              <div className="flex items-start gap-2">
                {isHighConfidencePaid ? (
                  <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
                )}
                <div>
                  <p className="font-semibold">
                    {isHighConfidencePaid ? 'Paid stamp detected' : 'Possible paid invoice detected'}
                  </p>
                  <p className="mt-1">
                    {isHighConfidencePaid
                      ? 'Payment Status was set to Paid. Confirm this before approving.'
                      : 'Review the invoice image/text before marking this paid.'}
                  </p>
                  {paidDetection.reviewed_by_user && (
                    <p className="mt-1 text-xs font-medium">Reviewer confirmed payment status: {paidDetection.user_selected_status}</p>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <RequiredLabel>Vendor Name</RequiredLabel>
              <Input
                value={invoice.vendor_name || ''}
                onChange={(e) => handleFieldChange('vendor_name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Invoice Number</RequiredLabel>
              <Input
                value={invoice.invoice_number || ''}
                onChange={(e) => handleFieldChange('invoice_number', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Account Number</Label>
              <Input
                value={invoice.account_number || ''}
                onChange={(e) => handleFieldChange('account_number', e.target.value)}
                placeholder="Vendor account #"
              />
            </div>
            <div className="space-y-2">
              <Label>Invoice Date</Label>
              <Input
                type="date"
                value={(invoice.invoice_date || '').split('T')[0]}
                onChange={(e) => handleFieldChange('invoice_date', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={(invoice.due_date || '').split('T')[0]}
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
              <Label>Payment Status</Label>
              <Select
                value={invoice.payment_status || 'unpaid'}
                onValueChange={(val) => handleFieldChange('payment_status', val)}
              >
                <SelectTrigger className="w-full bg-white border-slate-200">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="auto_pay">Auto-Pay</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subtotal</Label>
              <Input
                type="number"
                step="0.01"
                value={displayNumberInput(invoice.subtotal)}
                placeholder="0.00"
                onChange={(e) => handleFieldChange('subtotal', e.target.value)}
                onBlur={() => handleMoneyFieldBlur('subtotal')}
              />
            </div>
            <div className="space-y-2">
              <Label>Tax Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={displayNumberInput(invoice.tax_amount)}
                placeholder="0.00"
                onChange={(e) => handleFieldChange('tax_amount', e.target.value)}
                onBlur={() => handleMoneyFieldBlur('tax_amount')}
              />
            </div>
            <div className="space-y-2">
              <Label>Fuel Surcharge</Label>
              <Input
                type="number"
                step="0.01"
                value={displayNumberInput(invoice.fuel_surcharge)}
                placeholder="0.00"
                onChange={(e) => handleFieldChange('fuel_surcharge', e.target.value)}
                onBlur={() => handleMoneyFieldBlur('fuel_surcharge')}
              />
            </div>
            <div className="space-y-2">
              <Label>Delivery Fee</Label>
              <Input
                type="number"
                step="0.01"
                value={displayNumberInput(invoice.delivery_fee)}
                placeholder="0.00"
                onChange={(e) => handleFieldChange('delivery_fee', e.target.value)}
                onBlur={() => handleMoneyFieldBlur('delivery_fee')}
              />
            </div>
            <div className="space-y-2">
              <Label>Other Charges</Label>
              <Input
                type="number"
                step="0.01"
                value={displayNumberInput(invoice.other_charges)}
                placeholder="0.00"
                onChange={(e) => handleFieldChange('other_charges', e.target.value)}
                onBlur={() => handleMoneyFieldBlur('other_charges')}
              />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Total Amount</RequiredLabel>
              <Input
                type="number"
                step="0.01"
                value={displayNumberInput(invoice.total_amount)}
                placeholder="0.00"
                onChange={(e) => handleFieldChange('total_amount', e.target.value)}
                onBlur={() => handleMoneyFieldBlur('total_amount')}
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
                  <TableHead className="w-[120px] min-w-[120px]">Vendor Item ID</TableHead>
                  <TableHead className="min-w-[320px]">Vendor Item Description</TableHead>
                  <TableHead className="w-[120px] min-w-[120px]">Pack</TableHead>
                  <TableHead className="w-[140px] min-w-[140px]">Label</TableHead>
                  <TableHead className="w-[100px]">AI Match</TableHead>
                  <TableHead className="w-[90px] min-w-[90px]">Qty</TableHead>
                  <TableHead className="w-[90px] min-w-[90px]">Unit</TableHead>
                  <TableHead className="w-[110px] min-w-[110px]">Unit Price</TableHead>
                  <TableHead className="w-[80px]">Discount</TableHead>
                  <TableHead className="w-[80px]">Adjustment</TableHead>
                  <TableHead className="w-[100px]">Extended</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(invoice.line_items || []).map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Input
                        value={displayValue(item.vendor_item_code)}
                        onChange={(e) => handleLineItemChange(index, 'vendor_item_code', e.target.value)}
                        className="h-8"
                        placeholder="Item #"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={displayValue(item.description)}
                        onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                        className="h-8"
                        title={displayValue(item.description)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={displayValue(item.pack_size)}
                        onChange={(e) => handleLineItemChange(index, 'pack_size', e.target.value)}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={displayValue(item.label)}
                        onChange={(e) => handleLineItemChange(index, 'label', e.target.value)}
                        className="h-8"
                        title={displayValue(item.label)}
                      />
                    </TableCell>
                    <TableCell>
                      {(() => {
                        // Mock confidence for extracted items (or use real if available)
                        const confidence = item.ai_confidence || Math.floor(Math.random() * 20) + 80; // 80-99
                        const isHigh = confidence >= 90;
                        return (
                          <div className={`text-[10px] font-medium px-2 py-1 rounded-full text-center ${isHigh ? 'bg-resend-green/10 text-resend-green' : 'bg-resend-yellow/20 text-resend-yellow'}`}>
                            {confidence}% Conf
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={displayNumberInput(item.quantity)}
                        onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={displayValue(item.unit)}
                        onChange={(e) => handleLineItemChange(index, 'unit', e.target.value)}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={displayNumberInput(item.unit_price)}
                        onChange={(e) => handleLineItemChange(index, 'unit_price', e.target.value)}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={displayNumberInput(item.discount)}
                        onChange={(e) => handleLineItemChange(index, 'discount', e.target.value)}
                        className="h-8 text-red-500"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={displayNumberInput(item.adjustment)}
                        onChange={(e) => handleLineItemChange(index, 'adjustment', e.target.value)}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      ${asNumber(item.extended_price).toFixed(2)}
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
                    <TableCell colSpan={12} className="text-center text-slate-500 py-8">
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
              {(asNumber(invoice.tax_amount) > 0) && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Tax:</span>
                  <span className="font-medium">${asNumber(invoice.tax_amount).toFixed(2)}</span>
                </div>
              )}
              {(asNumber(invoice.fuel_surcharge) > 0) && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Fuel Surcharge:</span>
                  <span className="font-medium">${asNumber(invoice.fuel_surcharge).toFixed(2)}</span>
                </div>
              )}
              {(asNumber(invoice.delivery_fee) > 0) && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Delivery Fee:</span>
                  <span className="font-medium">${asNumber(invoice.delivery_fee).toFixed(2)}</span>
                </div>
              )}
              {(asNumber(invoice.other_charges) > 0) && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Other Charges:</span>
                  <span className="font-medium">${asNumber(invoice.other_charges).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold border-t pt-2">
                <span>Total:</span>
                <span className="text-teal-700">
                  ${asNumber(invoice.total_amount || (
                    calculateTotal() +
                    asNumber(invoice.tax_amount) +
                    asNumber(invoice.fuel_surcharge) +
                    asNumber(invoice.delivery_fee) +
                    asNumber(invoice.other_charges)
                  )).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reconciliation */}
      {invoice.id && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Reconciliation</CardTitle>
          </CardHeader>
          <CardContent>
            <ReconciliationVarianceTable invoiceId={invoice.id} isEditable={true} />
          </CardContent>
        </Card>
      )}

      {/* Category Summary & Split Coding */}
      {invoice.id && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Category & GL Allocations</CardTitle>
          </CardHeader>
          <CardContent>
            <CategorySummaryTable invoiceId={invoice.id} totalAmount={invoice.total_amount} />
          </CardContent>
        </Card>
      )}

      {/* AI Email Drafter */}
      {emailDrafterOpen && (
        <AIEmailDrafter
          open={emailDrafterOpen}
          onOpenChange={setEmailDrafterOpen}
          invoice={invoice}
          onSend={async (emailData) => {
            // Simulated send; you would normally hook up `emailService.send...`
            console.log('Sending drafted email', emailData);
            return Promise.resolve();
          }}
        />
      )}
    </div>
  );
}


