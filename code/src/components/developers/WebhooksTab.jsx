import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { Plus, Trash, Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

const AVAILABLE_EVENTS = [
  { id: 'profiles.insert', label: 'Customer Created' },
  { id: 'profiles.update', label: 'Customer Updated' },
  { id: 'employees.insert', label: 'Employee Created' },
  { id: 'employees.update', label: 'Employee Updated' },
  { id: 'inventory.update', label: 'Inventory Updated' }
];

export default function WebhooksTab() {
  const { activeOrg } = useAuth();
  const organizationId = activeOrg?.id;
  const [endpoints, setEndpoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState('');
  const [generatedSecret, setGeneratedSecret] = useState(null);
  const [copied, setCopied] = useState(false);
  
  useEffect(() => {
    if (organizationId) fetchEndpoints();
  }, [organizationId]);

  async function fetchEndpoints() {
    setLoading(true);
    try {
      const data = await api.entities.WebhookEndpoint.filter(
        { organization_id: organizationId },
        { orderBy: '-created_at' }
      );
      setEndpoints(data || []);
    } catch {
      toast.error("Failed to load webhooks");
    }
    setLoading(false);
  }

  async function handleAddEndpoint() {
    if (!newUrl.trim() || !newUrl.startsWith('http')) return toast.error("Please enter a valid URL starting with http/https");

    const { data, error } = await supabase.functions.invoke('create-webhook-endpoint', {
      body: {
        organization_id: organizationId,
        url: newUrl,
        events: AVAILABLE_EVENTS.map(evt => evt.id),
      },
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Failed to add webhook");
      return;
    }

    setGeneratedSecret(data.signingSecret);
    setNewUrl('');
    toast.success("Webhook endpoint added");
    fetchEndpoints();
  }

  async function handleToggleStatus(id, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await api.entities.WebhookEndpoint.update(id, { organization_id: organizationId, status: newStatus });
      fetchEndpoints();
    } catch {
      toast.error("Failed to update status");
    }
  }

  async function handleDelete(id) {
    try {
      await api.entities.WebhookEndpoint.delete(id);
      toast.success("Webhook deleted");
      fetchEndpoints();
    } catch {
      toast.error("Failed to delete webhook");
    }
  }

  async function handleTestEvent(endpointId) {
    // Insert a dummy event into the queue to test dispatch
    try {
      await api.entities.WebhookEventQueue.create({
        organization_id: organizationId,
        endpoint_id: endpointId,
        event_type: 'test.event',
        payload: { event: "test.event", timestamp: new Date().toISOString() },
        status: 'pending'
      });
      toast.success("Test event queued for delivery!");
    } catch {
      toast.error("Failed to trigger test event");
    }
  }

  function copySecretToClipboard() {
    if (generatedSecret) {
      navigator.clipboard.writeText(generatedSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Signing secret copied");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Webhook Endpoints</h2>
        <p className="text-sm text-muted-foreground">Receive real-time notifications when events occur in your organization.</p>
      </div>

      {generatedSecret && (
        <div className="p-4 border border-green-500 bg-green-500/10 rounded-md">
          <p className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2">Webhook Signing Secret Generated</p>
          <p className="text-xs mb-3 text-muted-foreground">Copy this secret now. It will not be shown again.</p>
          <div className="flex gap-2">
            <Input readOnly value={generatedSecret} className="font-mono" />
            <Button variant="outline" onClick={copySecretToClipboard}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <Button className="mt-4" variant="secondary" onClick={() => setGeneratedSecret(null)}>I have copied it</Button>
        </div>
      )}

      <div className="flex gap-4 items-end">
        <div className="grid gap-1.5 flex-1 max-w-md">
          <label className="text-sm font-medium">Endpoint URL</label>
          <Input placeholder="https://api.yourdomain.com/webhooks" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
        </div>
        <Button onClick={handleAddEndpoint}><Plus className="h-4 w-4 mr-2" /> Add Endpoint</Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead>Signing Secret</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center">Loading...</TableCell></TableRow>
            ) : endpoints.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No webhook endpoints found.</TableCell></TableRow>
            ) : endpoints.map(endpoint => (
              <TableRow key={endpoint.id}>
                <TableCell className="font-medium">{endpoint.url}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {endpoint.secret_prefix ? `${endpoint.secret_prefix}...` : 'Hidden'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch checked={endpoint.status === 'active'} onCheckedChange={() => handleToggleStatus(endpoint.id, endpoint.status)} />
                    <span className="text-sm text-muted-foreground capitalize">{endpoint.status}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" className="mr-2" onClick={() => handleTestEvent(endpoint.id)}>
                    Send Test
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(endpoint.id)} className="text-red-500">
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
