import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Building2, Users, Bell, MonitorPlay, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RestaurantSetup() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'pos';
  const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });

  const handleSave = () => {
    toast.success("Settings saved successfully!");
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
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Select POS provider and sync intervals. (Workflow under development)</p>
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
