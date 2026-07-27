import React from 'react';
import { Bell, Building2, MonitorPlay, Settings, Smartphone, Store } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const UPCOMING_AREAS = [
  { icon: MonitorPlay, label: 'POS setup' },
  { icon: Store, label: 'Store groups' },
  { icon: Smartphone, label: 'Shared devices' },
  { icon: Settings, label: 'Location settings' },
];

export default function RestaurantSetup() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Restaurant Setup</h1>
          <Badge variant="secondary" className="border border-border/60">Coming Soon</Badge>
        </div>
        <p className="text-muted-foreground mt-1">Operational setup tools are being prepared for this workspace.</p>
      </div>

      <Card className="border-0 shadow-sm glass-card">
        <CardContent className="p-8 md:p-10">
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-border/70 bg-secondary/50">
              <Building2 className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Restaurant setup is coming soon</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              POS connections, store grouping, shared devices, and location configuration will be available here once the setup workflow is ready.
            </p>

            <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
              {UPCOMING_AREAS.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3 rounded-md border border-border/60 bg-background/60 p-4 text-left">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">{label}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex items-center gap-2 rounded-md border border-border/60 bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
              <Bell className="h-4 w-4" />
              Notification rules now live in Notifications settings with their related modules.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
