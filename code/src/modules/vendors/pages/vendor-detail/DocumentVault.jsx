import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, FileText, Download, Trash2, Clock } from 'lucide-react';
import { toast } from "sonner";

export default function DocumentVault({ vendorId }) {
  const { organization } = useAuth();
  
  // In a real app, this would query a vendor_documents table. We mock it for the UI structure.
  const [documents, setDocuments] = useState([
    { id: 1, name: 'Vendor_W9_2026.pdf', type: 'W-9', uploaded_at: '2026-01-15T10:00:00Z', expires_at: '2027-01-15T10:00:00Z' },
    { id: 2, name: 'Master_Service_Agreement.pdf', type: 'Contract', uploaded_at: '2025-06-01T14:30:00Z', expires_at: '2028-06-01T14:30:00Z' },
    { id: 3, name: 'Price_Sheet_Q3.csv', type: 'Price Sheet', uploaded_at: '2026-06-01T09:15:00Z', expires_at: null },
    { id: 4, name: 'Liability_Insurance_COI.pdf', type: 'Insurance', uploaded_at: '2025-11-20T11:45:00Z', expires_at: '2026-11-20T11:45:00Z' }
  ]);

  const handleUpload = () => {
    toast.success("Document uploaded successfully. AI extraction running in background.");
  };

  const isExpiringSoon = (dateStr) => {
    if (!dateStr) return false;
    const expires = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(expires - now);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays <= 30;
  };

  return (
    <Card className="shadow-sm border-border/40">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Document Vault</CardTitle>
          <CardDescription>Securely store contracts, W-9s, price sheets, and insurance certificates.</CardDescription>
        </div>
        <Button onClick={handleUpload} className="bg-primary">
          <UploadCloud className="w-4 h-4 mr-2" /> Upload Document
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-border/40 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Expiration</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map(doc => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    {doc.name}
                  </TableCell>
                  <TableCell><Badge variant="outline">{doc.type}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(doc.uploaded_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {doc.expires_at ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{new Date(doc.expires_at).toLocaleDateString()}</span>
                        {isExpiringSoon(doc.expires_at) && (
                          <Clock className="w-4 h-4 text-resend-red" title="Expiring soon" />
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon"><Download className="w-4 h-4 text-muted-foreground hover:text-foreground" /></Button>
                      <Button variant="ghost" size="icon"><Trash2 className="w-4 h-4 text-resend-red/70 hover:text-resend-red" /></Button>
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
