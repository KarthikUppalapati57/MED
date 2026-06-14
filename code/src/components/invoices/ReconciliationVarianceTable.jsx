import React, { useState } from 'react';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { filterByContext } from '@/lib/contextUtils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function ReconciliationVarianceTable({ invoiceId, isEditable = false }) {
  const { organization } = useAuth();
  const queryClient = useQueryClient();

  const { data: variances = [], isLoading } = useQuery({
    queryKey: ['invoice-variances', invoiceId],
    queryFn: async () => {
      if (!invoiceId) return [];
      const res = await api.client.from('reconciliation_variances')
        .select('*')
        .eq('invoice_id', invoiceId);
      if (res.error) throw res.error;
      return res.data;
    },
    enabled: !!invoiceId
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, resolution_notes }) => {
      // Stub for updating the variance resolution in DB
      const result = await api.client.from('reconciliation_variances')
        .update({ is_resolved: true, resolution_notes, resolved_by: (await api.auth.getUser()).data.user?.id })
        .eq('id', id)
        .select()
        .single();
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => {
      toast.success('Variance resolved.');
      queryClient.invalidateQueries({ queryKey: ['invoice-variances', invoiceId] });
    },
    onError: (err) => {
      toast.error('Failed to resolve variance: ' + err.message);
    }
  });

  const [resolvingId, setResolvingId] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  if (!variances || variances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border rounded-lg bg-slate-50 border-dashed">
        <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2" />
        <p className="text-sm font-medium text-slate-700">All items matched within tolerance.</p>
        <p className="text-xs text-slate-500">No reconciliation variances detected.</p>
      </div>
    );
  }

  const handleResolve = (id) => {
    if (!resolutionNotes) return toast.error('Resolution notes are required.');
    resolveMutation.mutate({ id, resolution_notes: resolutionNotes });
    setResolvingId(null);
    setResolutionNotes('');
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg flex items-center">
        <AlertCircle className="h-5 w-5 mr-2 text-amber-500" />
        Reconciliation Variances ({variances.filter(v => !v.is_resolved).length} Unresolved)
      </h3>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Expected</TableHead>
              <TableHead>Actual</TableHead>
              <TableHead>Variance Amt</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variances.map(variance => (
              <TableRow key={variance.id}>
                <TableCell className="font-medium">
                  {variance.variance_type.replace('_', ' ').toUpperCase()}
                </TableCell>
                <TableCell>${variance.expected_value?.toFixed(2) || '0.00'}</TableCell>
                <TableCell>${variance.actual_value?.toFixed(2) || '0.00'}</TableCell>
                <TableCell className="text-rose-600 font-semibold">${variance.variance_amount?.toFixed(2)}</TableCell>
                <TableCell>
                  {variance.is_resolved ? (
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Resolved</Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">Action Required</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!variance.is_resolved && isEditable ? (
                    resolvingId === variance.id ? (
                      <div className="flex items-center gap-2">
                        <Input 
                          size="sm" 
                          placeholder="Notes..." 
                          value={resolutionNotes} 
                          onChange={e => setResolutionNotes(e.target.value)}
                        />
                        <Button size="sm" onClick={() => handleResolve(variance.id)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setResolvingId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setResolvingId(variance.id)}>Resolve</Button>
                    )
                  ) : (
                    <span className="text-xs text-slate-500">{variance.resolution_notes || 'N/A'}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
