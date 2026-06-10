import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { Plus, Trash, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function ApiKeysTab() {
  const { supabase, organizationId } = useSupabaseAuth();
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
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    
    if (error) {
      toast.error("Failed to load API keys");
    } else {
      setKeys(data || []);
    }
    setLoading(false);
  }

  // NOTE: In a real app, API key generation should be done server-side 
  // via an Edge Function so the secret key isn't hashed on the client. 
  // For this V1 implementation demo, we simulate it.
  async function handleGenerateKey() {
    if (!newKeyName.trim()) return toast.error("Please enter a key name");

    const rawKey = `sk_live_${crypto.randomUUID().replace(/-/g, '')}`;
    const prefix = rawKey.substring(0, 12);
    
    // Hash key using Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(rawKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const { error } = await supabase.from('api_keys').insert({
      organization_id: organizationId,
      name: newKeyName,
      prefix,
      key_hash: keyHash
    });

    if (error) {
      toast.error("Failed to create API key");
      return;
    }

    setGeneratedKey(rawKey);
    setNewKeyName('');
    fetchKeys();
  }

  async function handleRevoke(id) {
    const { error } = await supabase.from('api_keys').delete().eq('id', id);
    if (error) toast.error("Failed to revoke key");
    else {
      toast.success("API key revoked");
      fetchKeys();
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
