import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Plus, Trash, Check, Copy } from 'lucide-react';
import { format } from 'date-fns';
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
  
  useEffect(() => {
    if (organizationId) fetchEndpoints();
  }, [organizationId]);

  async function fetchEndpoints() {
    setLoading(true);
    const { data, error } = await supabase
      .from('webhook_endpoints')
      .select(`*, webhook_subscriptions(event_type)`)
      .eq('organization_id', organizationId);
    
    if (error) toast.error("Failed to load webhooks");
    else setEndpoints(data || []);
    setLoading(false);
  }

  async function handleAddEndpoint() {
    if (!newUrl.trim() || !newUrl.startsWith('http')) return toast.error("Please enter a valid URL starting with http/https");

    // Generate random whsec_ secret
    const secret = `whsec_${crypto.randomUUID().replace(/-/g, '')}`;

    const { data, error } = await supabase.from('webhook_endpoints').insert({
      organization_id: organizationId,
      url: newUrl,
      secret
    }).select().single();

    if (error) {
      toast.error("Failed to add webhook");
      return;
    }

    // Auto-subscribe to all events for demo purposes
    const subs = AVAILABLE_EVENTS.map(evt => ({ endpoint_id: data.id, event_type: evt.id }));
    await supabase.from('webhook_subscriptions').insert(subs);

    setNewUrl('');
    toast.success("Webhook endpoint added");
    fetchEndpoints();
  }

  async function handleToggleStatus(id, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const { error } = await supabase.from('webhook_endpoints').update({ status: newStatus }).eq('id', id);
    if (error) toast.error("Failed to update status");
    else fetchEndpoints();
  }

  async function handleDelete(id) {
    const { error } = await supabase.from('webhook_endpoints').delete().eq('id', id);
    if (error) toast.error("Failed to delete webhook");
    else {
      toast.success("Webhook deleted");
      fetchEndpoints();
    }
  }

  async function handleTestEvent(endpointId) {
    // Insert a dummy event into the queue to test dispatch
    const { error } = await supabase.from('webhook_events_queue').insert({
      organization_id: organizationId,
      endpoint_id: endpointId,
      event_type: 'test.event',
      payload: { event: "test.event", timestamp: new Date().toISOString() },
      status: 'pending'
    });

    if (error) toast.error("Failed to trigger test event");
    else toast.success("Test event queued for delivery!");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Webhook Endpoints</h2>
        <p className="text-sm text-muted-foreground">Receive real-time notifications when events occur in your organization.</p>
      </div>

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
                  {endpoint.secret.substring(0, 15)}...
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
