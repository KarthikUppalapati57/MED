import React from 'react';
import { useSearchParams } from 'react-router-dom';
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

  const handleSave = () => {
    toast.success("Settings saved successfully!");
  };

  const handleTestConnection = () => {
    setIsTesting(true);
    setTestStatus(null);
    setTimeout(() => {
      setIsTesting(false);
      setTestStatus('success');
      toast.success("Successfully connected to POS system!");
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Restaurant Setup</h1>
          <p className="text-muted-foreground mt-1">Configure your location's operational settings.</p>
        </div>
        <Button className="bg-primary hover:bg-primary text-black" onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" /> Save Changes
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
                    if (newGroup) {
                      toast.success(`Group "${newGroup}" created`);
                      setNewGroup('');
                    }
                  }}>
                    <Plus className="h-4 w-4 mr-2" /> Add
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devices" className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1.5">
                <CardTitle>Shared Devices</CardTitle>
                <CardDescription>Manage terminals and tablets used by staff without individual logins.</CardDescription>
              </div>
              <Button onClick={() => toast.success("New PIN: 8492-4192. Valid for 10 minutes.")}>
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
                <Input placeholder="E.g., Flagship, Express" />
              </div>
              <div className="space-y-2">
                <Label>Tax Rate (%)</Label>
                <Input type="number" placeholder="8.5" />
              </div>
              <div className="space-y-2">
                <Label>Default Receiving Auto-Approval</Label>
                <Input placeholder="$500.00" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
