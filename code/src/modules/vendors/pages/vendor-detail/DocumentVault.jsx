import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Clock } from 'lucide-react';
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
        <CardDescription>W-9s, certificates of insurance, business licenses, agreements, and vendor-uploaded files.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-border/40 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Expiration</TableHead>
                <TableHead className="w-[72px]"></TableHead>
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
                    <Button variant="ghost" size="icon" onClick={() => handleDownload(doc)}>
                      <Download className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                    </Button>
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