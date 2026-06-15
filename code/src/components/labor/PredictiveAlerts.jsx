import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BellRing, Check, TrendingDown, AlertTriangle } from 'lucide-react';
import { toast } from "sonner";

export default function PredictiveAlerts({ laborCost, sales, weatherData }) {
  const [alerts, setAlerts] = useState([
    {
      id: 1,
      type: 'critical',
      message: "Weather is raining. Foot traffic down 18% vs historical average.",
      recommendation: "Cut 1 Prep Cook and 1 Server now to save $120 on shift.",
      actionLabel: "Send Cut Notification to Floor Manager",
      status: 'active'
    },
    {
      id: 2,
      type: 'warning',
      message: "Labor cost is pacing at 34% for lunch shift (Target: 28%).",
      recommendation: "Review breaks for BOH staff. 3 employees approaching overtime.",
      actionLabel: "View Overtime Risk Report",
      status: 'active'
    }
  ]);

  const handleAction = (alertId) => {
    toast.success("Action taken! Notification sent to the floor manager via SMS.");
    setAlerts(alerts.map(a => a.id === alertId ? { ...a, status: 'resolved' } : a));
  };

  const activeAlerts = alerts.filter(a => a.status === 'active');

  return (
    <Card className="border-0 shadow-sm border-t-4 border-t-resend-orange bg-gradient-to-br from-orange-50 via-white to-orange-50">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <BellRing className="h-5 w-5 text-resend-orange animate-pulse" />
              Live Shift Intelligence
            </CardTitle>
            <CardDescription>
              Real-time AI recommendations based on live sales and labor pacing.
            </CardDescription>
          </div>
          <Badge variant="outline" className="bg-white">
            {activeAlerts.length} Active Alert(s)
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {activeAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <Check className="h-12 w-12 text-resend-green mb-3 opacity-50" />
            <p className="font-medium">Shift is pacing perfectly</p>
            <p className="text-sm text-muted-foreground">Labor is currently optimized for live sales volume.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeAlerts.map(alert => (
              <div key={alert.id} className="bg-white p-4 rounded-xl border border-resend-orange/20 shadow-sm relative overflow-hidden">
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${alert.type === 'critical' ? 'bg-resend-red' : 'bg-resend-yellow'}`}></div>
                <div className="flex gap-3">
                  <div className="mt-1">
                    {alert.type === 'critical' ? (
                      <TrendingDown className="h-5 w-5 text-resend-red" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-resend-yellow" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm mb-1">{alert.message}</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      <strong>AI Suggests:</strong> {alert.recommendation}
                    </p>
                    <Button 
                      size="sm" 
                      className={`w-full sm:w-auto ${alert.type === 'critical' ? 'bg-resend-red hover:bg-resend-red/90 text-white' : 'bg-secondary text-foreground hover:bg-secondary/80'}`}
                      onClick={() => handleAction(alert.id)}
                    >
                      {alert.actionLabel}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
