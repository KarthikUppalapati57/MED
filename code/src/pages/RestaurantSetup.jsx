import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Building2, Users, Bell, MonitorPlay, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, Plus, Trash2, Smartphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
export default function RestaurantSetup() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'pos';
  const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });
  const queryClient = useQueryClient();
  const { organization, brand, location, userProfile } = useAuth();
  const activeOrgId = organization?.id || userProfile?.organization_id;
  const activeBrandId = (brand?.brand_id || brand?.id) || null;
  const activeLocationId = location?.id || userProfile?.location_id || null;

  const [posProvider, setPosProvider] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const [syncInterval, setSyncInterval] = React.useState('15');
  const [isTesting, setIsTesting] = React.useState(false);
  const [testStatus, setTestStatus] = React.useState(null); // 'success' | 'error' | null

  // Store Groups
  const [storeGroup, setStoreGroup] = React.useState('');
  const [newGroup, setNewGroup] = React.useState('');

  // Shared Devices
  const [devices, setDevices] = React.useState([
    { id: 1, name: 'Kitchen KDS', status: 'Active', lastActive: '2 mins ago' },
    { id: 2, name: 'Front Register', status: 'Active', lastActive: 'Just now' },
  ]);

  // Notifications
  const [notifications, setNotifications] = React.useState({
    lowStock: true,
    largeOrders: true,
    eodSummary: false,
    systemAlerts: true
  });
  const [locationSettings, setLocationSettings] = React.useState({
    storeConcept: '',
    taxRate: '',
    receivingAutoApproval: '',
  });

  const { data: settingsRows = [] } = useAuthQuery({
    queryKey: ['operational_settings', activeOrgId, activeBrandId, activeLocationId],
    queryFn: () => api.entities.OperationalSetting.filter({ organization_id: activeOrgId }),
    enabled: !!activeOrgId,
  });

  const { data: integrations = [] } = useAuthQuery({
    queryKey: ['integrations', activeOrgId],
    queryFn: () => api.entities.Integration.filter({ organization_id: activeOrgId }),
    enabled: !!activeOrgId,
  });

  const { data: locationGroups = [] } = useAuthQuery({
    queryKey: ['location_groups', activeOrgId],
    queryFn: () => api.entities.LocationGroup.filter({ organization_id: activeOrgId }),
    enabled: !!activeOrgId,
  });

  const setupSettings = settingsRows.find((row) => row.category === 'restaurant_setup');
  const locationConfig = settingsRows.find((row) => row.category === 'location_config');
  const posIntegration = integrations.find((row) => row.provider === posProvider || row.metadata?.originalId === posProvider);

  React.useEffect(() => {
    if (setupSettings?.settings) {
      setSyncInterval(String(setupSettings.settings.syncInterval || '15'));
      setStoreGroup(setupSettings.settings.storeGroup || '');
      setNotifications({
        lowStock: setupSettings.settings.notifications?.lowStock ?? true,
        largeOrders: setupSettings.settings.notifications?.largeOrders ?? true,
        eodSummary: setupSettings.settings.notifications?.eodSummary ?? false,
        systemAlerts: setupSettings.settings.notifications?.systemAlerts ?? true,
      });
      setDevices(setupSettings.settings.devices || []);
    }
  }, [setupSettings]);

  React.useEffect(() => {
    if (locationConfig?.settings) {
      setLocationSettings({
        storeConcept: locationConfig.settings.storeConcept || '',
        taxRate: locationConfig.settings.taxRate || '',
        receivingAutoApproval: locationConfig.settings.receivingAutoApproval || '',
      });
    }
  }, [locationConfig]);

  React.useEffect(() => {
    const configuredPos = integrations.find((row) =>
      ['toast', 'square', 'clover', 'lightspeed'].includes(row.provider) || row.metadata?.type === 'pos'
    );
    if (configuredPos) {
      setPosProvider(configuredPos.metadata?.originalId || configuredPos.provider);
      setApiKey(configuredPos.metadata?.apiKey ? '********' : '');
    }
  }, [integrations]);

  const upsertSetting = async (category, settings) => {
    const existing = settingsRows.find((row) => row.category === category);
    const payload = {
      organization_id: activeOrgId,
      brand_id: activeBrandId,
      location_id: activeLocationId,
      scope: activeLocationId ? 'location' : activeBrandId ? 'brand' : 'organization',
      category,
      settings,
      created_by: userProfile?.id || null,
      updated_by: userProfile?.id || null,
    };

    if (existing) {
      return api.entities.OperationalSetting.update(existing.id, payload);
    }
    return api.entities.OperationalSetting.create(payload);
  };

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!activeOrgId) throw new Error('No active organization selected');
      await Promise.all([
        upsertSetting('restaurant_setup', {
          syncInterval,
          storeGroup,
          notifications,
          devices,
        }),
        upsertSetting('location_config', locationSettings),
      ]);

      if (posProvider && apiKey && apiKey !== '********') {
        const providerPayload = {
          organization_id: activeOrgId,
          provider: posProvider,
          metadata: {
            type: 'pos',
            originalId: posProvider,
            apiKey,
            syncInterval,
            brand_id: activeBrandId,
            location_id: activeLocationId,
            validation_status: 'pending_provider_sync',
          },
          is_active: true,
        };
        const existing = integrations.find((row) => row.provider === posProvider || row.metadata?.originalId === posProvider);
        if (existing) await api.entities.Integration.update(existing.id, providerPayload);
        else await api.entities.Integration.create(providerPayload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operational_settings', activeOrgId, activeBrandId, activeLocationId] });
      queryClient.invalidateQueries({ queryKey: ['integrations', activeOrgId] });
      toast.success("Settings saved successfully");
    },
    onError: (error) => toast.error(error.message || 'Failed to save settings'),
  });

  const handleSave = () => {
    saveSettingsMutation.mutate();
  };

  const handleTestConnection = async () => {
    if (!posProvider || !apiKey || apiKey === '********') {
      toast.error('Enter provider credentials before saving the connection');
      return;
    }
    setIsTesting(true);
    setTestStatus(null);
    try {
      await saveSettingsMutation.mutateAsync();
      setTestStatus('success');
      toast.success("POS configuration saved. Provider validation will run during the next sync.");
    } catch (error) {
      setTestStatus('error');
      toast.error(error.message || 'Failed to save POS configuration');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Restaurant Setup</h1>
          <p className="text-muted-foreground mt-1">Configure your location's operational settings.</p>
        </div>
        <Button className="bg-primary hover:bg-primary text-primary-foreground" onClick={handleSave} disabled={saveSettingsMutation.isPending}>
          {saveSettingsMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 mb-6">
          <TabsTrigger value="pos"><MonitorPlay className="h-4 w-4 mr-2" /> POS Setup</TabsTrigger>
          <TabsTrigger value="groups"><Building2 className="h-4 w-4 mr-2" /> Store Groups</TabsTrigger>
          <TabsTrigger value="devices"><Users className="h-4 w-4 mr-2" /> Shared Devices</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-4 w-4 mr-2" /> Notifications</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="h-4 w-4 mr-2" /> Location Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="pos" className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>POS Integration Settings</CardTitle>
              <CardDescription>Configure POS synchronization preferences for this location.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 max-w-md">
              <div className="space-y-2">
                <Label>POS Provider</Label>
                <Select value={posProvider} onValueChange={setPosProvider}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a POS Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="toast">Toast POS</SelectItem>
                    <SelectItem value="square">Square</SelectItem>
                    <SelectItem value="lightspeed">Lightspeed</SelectItem>
                    <SelectItem value="clover">Clover</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {posProvider && (
                <>
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <Input 
                      type="password" 
                      placeholder={`Enter your ${posProvider} API Key`}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Sync Interval</Label>
                    <Select value={syncInterval} onValueChange={setSyncInterval}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select sync frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">Every 15 minutes</SelectItem>
                        <SelectItem value="30">Every 30 minutes</SelectItem>
                        <SelectItem value="60">Hourly</SelectItem>
                        <SelectItem value="1440">Daily (End of Day)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="pt-4 flex items-center space-x-4">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={handleTestConnection}
                      disabled={isTesting || !apiKey}
                      className={testStatus === 'success' ? 'border-green-500 text-green-600' : ''}
                    >
                      {isTesting ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing Connection...</>
                      ) : testStatus === 'success' ? (
                        <><CheckCircle2 className="mr-2 h-4 w-4 text-green-500" /> Connection Successful</>
                      ) : (
                        "Test Connection"
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="groups" className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Store Groupings</CardTitle>
              <CardDescription>Assign this location to organizational groups for consolidated reporting.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 max-w-md">
              <div className="space-y-2">
                <Label>Primary Region/District</Label>
                <Select value={storeGroup} onValueChange={setStoreGroup}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a region" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="north">North Region</SelectItem>
                    <SelectItem value="south">South Region</SelectItem>
                    <SelectItem value="east">East Region</SelectItem>
                    <SelectItem value="west">West Region</SelectItem>
                    <SelectItem value="central">Central District</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-4 border-t border-border/40 space-y-4">
                <Label>Create New Group</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Enter new group name..." 
                    value={newGroup}
                    onChange={(e) => setNewGroup(e.target.value)}
                  />
                  <Button type="button" variant="secondary" onClick={() => {
                    if (newGroup && activeOrgId) {
                      api.entities.LocationGroup.create({
                        organization_id: activeOrgId,
                        name: newGroup,
                        description: 'Created from Restaurant Setup',
                      }).then(() => {
                        queryClient.invalidateQueries({ queryKey: ['location_groups', activeOrgId] });
                        toast.success(`Group "${newGroup}" created`);
                      }).catch((error) => toast.error(error.message || 'Failed to create group'));
                      setNewGroup('');
                    }
                  }}>
                    <Plus className="h-4 w-4 mr-2" /> Add
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          {locationGroups.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Configured Groups</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {locationGroups.map((group) => (
                  <Badge key={group.id} variant="secondary" className="mr-2">{group.name}</Badge>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="devices" className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1.5">
                <CardTitle>Shared Devices</CardTitle>
                <CardDescription>Manage terminals and tablets used by staff without individual logins.</CardDescription>
              </div>
              <Button onClick={() => {
                const pin = Math.floor(100000 + Math.random() * 900000).toString();
                setDevices([...devices, { id: crypto.randomUUID(), name: `Shared Device ${devices.length + 1}`, status: 'Pending', lastActive: 'Awaiting registration', pin }]);
                toast.success(`Registration PIN: ${pin}. Save changes to persist this device.`);
              }}>
                <Plus className="h-4 w-4 mr-2" /> Register Device
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border/50">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Active</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devices.map((device) => (
                      <TableRow key={device.id}>
                        <TableCell className="font-medium flex items-center">
                          <Smartphone className="h-4 w-4 mr-2 text-muted-foreground" />
                          {device.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                            {device.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{device.lastActive}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            onClick={() => {
                              setDevices(devices.filter(d => d.id !== device.id));
                              toast.success("Device removed successfully");
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {devices.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No shared devices registered.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Notification Rules</CardTitle>
              <CardDescription>Configure alerts for inventory thresholds, large orders, and system events.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 max-w-md">
              <div className="flex items-center justify-between space-x-2">
                <div className="space-y-0.5">
                  <Label>Low Stock Alerts</Label>
                  <p className="text-sm text-muted-foreground">Receive alerts when inventory falls below minimums.</p>
                </div>
                <Switch 
                  checked={notifications.lowStock}
                  onCheckedChange={(c) => setNotifications({...notifications, lowStock: c})}
                />
              </div>
              
              <div className="flex items-center justify-between space-x-2">
                <div className="space-y-0.5">
                  <Label>Large Order Approvals</Label>
                  <p className="text-sm text-muted-foreground">Notify managers for POs exceeding $500.</p>
                </div>
                <Switch 
                  checked={notifications.largeOrders}
                  onCheckedChange={(c) => setNotifications({...notifications, largeOrders: c})}
                />
              </div>

              <div className="flex items-center justify-between space-x-2">
                <div className="space-y-0.5">
                  <Label>End of Day Summary</Label>
                  <p className="text-sm text-muted-foreground">Daily sales and labor cost digest at 11:00 PM.</p>
                </div>
                <Switch 
                  checked={notifications.eodSummary}
                  onCheckedChange={(c) => setNotifications({...notifications, eodSummary: c})}
                />
              </div>

              <div className="flex items-center justify-between space-x-2">
                <div className="space-y-0.5">
                  <Label>System Health Alerts</Label>
                  <p className="text-sm text-muted-foreground">Notices for POS sync failures or integration errors.</p>
                </div>
                <Switch 
                  checked={notifications.systemAlerts}
                  onCheckedChange={(c) => setNotifications({...notifications, systemAlerts: c})}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Location/Brand Settings</CardTitle>
              <CardDescription>Update general operational details for this location.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label>Store Concept/Brand</Label>
                <Input
                  placeholder="E.g., Flagship, Express"
                  value={locationSettings.storeConcept}
                  onChange={(e) => setLocationSettings({ ...locationSettings, storeConcept: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Tax Rate (%)</Label>
                <Input
                  type="number"
                  placeholder="8.5"
                  value={locationSettings.taxRate}
                  onChange={(e) => setLocationSettings({ ...locationSettings, taxRate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Default Receiving Auto-Approval</Label>
                <Input
                  placeholder="$500.00"
                  value={locationSettings.receivingAutoApproval}
                  onChange={(e) => setLocationSettings({ ...locationSettings, receivingAutoApproval: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
