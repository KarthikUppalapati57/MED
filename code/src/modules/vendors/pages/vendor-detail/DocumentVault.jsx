import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Download, Clock, Loader2, UploadCloud } from 'lucide-react';
import { toast } from "sonner";

const documentLabels = {
  w9: 'W-9',
  certificate_of_insurance: 'Insurance',
  business_license: 'Business License',
  vendor_agreement: 'Agreement',
  other: 'Other',
};

const statusLabels = {
  pending_review: 'Pending Review',
  on_file: 'On File',
  expired: 'Expired',
  rejected: 'Rejected',
};

export default function DocumentVault({ vendorId }) {
  const queryClient = useQueryClient();
  const [documentType, setDocumentType] = useState('w9');
  const [selectedFile, setSelectedFile] = useState(null);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['vendor_documents', vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_documents')
        .select('id, document_type, file_name, storage_path, mime_type, file_size_bytes, status, uploaded_via, reviewed_at, review_notes, created_at, expires_at')
        .eq('vendor_id', vendorId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!vendorId,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error('Choose a file first');
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `admin_uploads/${vendorId}/${Date.now()}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('vendor_documents')
        .upload(storagePath, selectedFile, { upsert: false });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from('vendor_documents')
        .insert({
          vendor_id: vendorId,
          document_type: documentType,
          file_name: selectedFile.name,
          storage_path: storagePath,
          mime_type: selectedFile.type || 'application/octet-stream',
          file_size_bytes: selectedFile.size,
          status: 'pending_review',
          uploaded_via: 'admin_upload',
        });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ['vendor_documents', vendorId] });
      queryClient.invalidateQueries({ queryKey: ['vendor_onboarding_panel', vendorId] });
      toast.success('Document uploaded');
    },
    onError: (err) => toast.error(err.message || 'Upload failed'),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase
        .from('vendor_documents')
        .update({ status, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor_documents', vendorId] });
      queryClient.invalidateQueries({ queryKey: ['vendor_onboarding_panel', vendorId] });
      toast.success('Document status updated');
    },
    onError: (err) => toast.error(err.message || 'Review update failed'),
  });

  const handleDownload = async (doc) => {
    const { data, error } = await supabase.storage
      .from('vendor_documents')
      .createSignedUrl(doc.storage_path, 60);

    if (error || !data?.signedUrl) {
      toast.error(error?.message || 'Unable to create download link');
      return;
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const isExpiringSoon = (dateStr) => {
    if (!dateStr) return false;
    const expires = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 30;
  };

  return (
    <Card className="shadow-sm border-border/40">
      <CardHeader>
        <CardTitle>Document Vault</CardTitle>
        <CardDescription>Upload, review, and retrieve W-9s, certificates, licenses, agreements, and vendor files.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 rounded-md border border-border/50 p-4 md:grid-cols-[220px_1fr_auto] md:items-end">
          <div className="space-y-2">
            <p className="text-sm font-medium">Document Type</p>
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(documentLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">File</p>
            <input
              type="file"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
            />
          </div>
          <Button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending || !selectedFile}>
            {uploadMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
            Upload
          </Button>
        </div>

        <div className="rounded-md border border-border/40 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Expiration</TableHead>
                <TableHead className="w-[220px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">Loading documents...</TableCell>
                </TableRow>
              )}

              {!isLoading && documents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">No vendor documents are on file.</TableCell>
                </TableRow>
              )}

              {documents.map(doc => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      {doc.file_name || doc.storage_path.split('/').pop()}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{documentLabels[doc.document_type] || doc.document_type}</Badge></TableCell>
                  <TableCell><Badge variant={doc.status === 'on_file' ? 'default' : 'secondary'}>{statusLabels[doc.status] || doc.status}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(doc.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {doc.expires_at ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{new Date(doc.expires_at).toLocaleDateString()}</span>
                        {isExpiringSoon(doc.expires_at) && <Clock className="w-4 h-4 text-resend-red" />}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => reviewMutation.mutate({ id: doc.id, status: 'on_file' })}>On File</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDownload(doc)}><Download className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}