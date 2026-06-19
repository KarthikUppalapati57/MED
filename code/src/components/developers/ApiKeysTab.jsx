import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { api } from '@/lib/apiClient';
import { Plus, Trash, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function ApiKeysTab() {
  const { activeOrg } = useAuth();
  const organizationId = activeOrg?.id;
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (organizationId) fetchKeys();
  }, [organizationId]);

  async function fetchKeys() {
    setLoading(true);
    try {
      const data = await api.entities.ApiKey.filter(
        { organization_id: organizationId },
        { orderBy: '-created_at' }
      );
      setKeys(data || []);
    } catch {
      toast.error("Failed to load API keys");
    }
    setLoading(false);
  }

  async function handleGenerateKey() {
    if (!newKeyName.trim()) return toast.error("Please enter a key name");

    const { data, error } = await supabase.functions.invoke('create-api-key', {
      body: {
        name: newKeyName,
        organization_id: organizationId,
      },
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Failed to create API key");
      return;
    }

    setGeneratedKey(data.apiKey);
    setNewKeyName('');
    fetchKeys();
  }

  async function handleRevoke(id) {
    try {
      await api.entities.ApiKey.delete(id);
      toast.success("API key revoked");
      fetchKeys();
    } catch {
      toast.error("Failed to revoke key");
    }
  }

  function copyToClipboard() {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("API Key copied to clipboard");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">API Keys</h2>
        <p className="text-sm text-muted-foreground">Manage API keys to access your organization's data via the REST API.</p>
      </div>

      {generatedKey && (
        <div className="p-4 border border-green-500 bg-green-500/10 rounded-md">
          <p className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2">New API Key Generated</p>
          <p className="text-xs mb-3 text-muted-foreground">Please copy this key now. You will not be able to see it again.</p>
          <div className="flex gap-2">
            <Input readOnly value={generatedKey} className="font-mono" />
            <Button variant="outline" onClick={copyToClipboard}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <Button className="mt-4" variant="secondary" onClick={() => setGeneratedKey(null)}>I have copied it</Button>
        </div>
      )}

      <div className="flex gap-4 items-end">
        <div className="grid gap-1.5 flex-1 max-w-sm">
          <label className="text-sm font-medium">Key Name</label>
          <Input placeholder="e.g. Production Pos Integration" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
        </div>
        <Button onClick={handleGenerateKey}><Plus className="h-4 w-4 mr-2" /> Generate Key</Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last Used</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center">Loading...</TableCell></TableRow>
            ) : keys.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No API keys found.</TableCell></TableRow>
            ) : keys.map(key => (
              <TableRow key={key.id}>
                <TableCell className="font-medium">{key.name}</TableCell>
                <TableCell className="font-mono">{key.prefix}...</TableCell>
                <TableCell>{format(new Date(key.created_at), 'MMM d, yyyy')}</TableCell>
                <TableCell>{key.last_used_at ? format(new Date(key.last_used_at), 'MMM d, yyyy') : 'Never'}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => handleRevoke(key.id)} className="text-red-500">
                    <Trash className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
