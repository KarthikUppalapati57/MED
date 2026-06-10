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
import { Loader2, CheckCircle2 } from "lucide-react";
export default function RestaurantSetup() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'pos';
  const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });

  const [posProvider, setPosProvider] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const [syncInterval, setSyncInterval] = React.useState('15');
  const [isTesting, setIsTesting] = React.useState(false);
  const [testStatus, setTestStatus] = React.useState(null); // 'success' | 'error' | null

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
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Manage reporting groups. (Workflow under development)</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devices" className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Shared Devices</CardTitle>
              <CardDescription>Manage terminals and tablets used by staff without individual logins.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Register devices via PIN. (Workflow under development)</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Notification Rules</CardTitle>
              <CardDescription>Configure alerts for inventory thresholds, large orders, and system events.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Define custom rules. (Workflow under development)</p>
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
