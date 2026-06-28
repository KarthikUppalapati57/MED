import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { ShieldCheck, Thermometer, ThermometerSnowflake, AlertTriangle, CheckCircle, Clock, Server } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function FoodSafety() {
  const { organization, location } = useAuth();
  const queryClient = useQueryClient();

  const { data: sensors = [], isLoading: loadingSensors } = useQuery({
    queryKey: ['iot_sensors', location?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('iot_sensors')
        .select('*')
        .eq('location_id', location?.id)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!location?.id
  });

  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['temperature_logs', location?.id],
    queryFn: async () => {
      if (sensors.length === 0) return [];
      const sensorIds = sensors.map(s => s.id);
      const { data, error } = await supabase
        .from('temperature_logs')
        .select('*, iot_sensors(name)')
        .in('sensor_id', sensorIds)
        .order('logged_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: sensors.length > 0
  });

  // Realtime updates for temperature logs
  useEffect(() => {
    if (sensors.length === 0) return;
    const channel = supabase.channel('temp_logs_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'temperature_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['temperature_logs'] });
        queryClient.invalidateQueries({ queryKey: ['iot_sensors'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); }
  }, [sensors, queryClient]);

  const simulateIngest = async (sensor) => {
    const isAlert = Math.random() > 0.8;
    const temp = isAlert ? (42 + Math.random() * 5) : (34 + Math.random() * 6); // 34-40 normal, 42-47 alert
    
    const toastId = toast.loading(`Simulating ping for ${sensor.name}...`);
    try {
      const payload = {
        mac_address: sensor.mac_address,
        temperature_f: Number(temp.toFixed(2)),
        humidity_percent: Number((40 + Math.random() * 20).toFixed(2))
      };
      
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/iot-ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error(await res.text());
      
      if (isAlert) {
        toast.error(`Alert triggered! ${temp.toFixed(1)}°F recorded for ${sensor.name}`, { id: toastId });
      } else {
        toast.success(`Ping successful: ${temp.toFixed(1)}°F`, { id: toastId });
      }
    } catch (e) {
      toast.error(`Simulation failed: ${e.message}`, { id: toastId });
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'offline': return 'bg-slate-50 text-slate-700 border-slate-200';
      case 'maintenance': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-secondary text-muted-foreground';
    }
  };

  if (!organization || !location) return null;

  const activeAlerts = logs.filter(l => l.is_alert && new Date(l.logged_at) > new Date(Date.now() - 24 * 60 * 60 * 1000));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Food Safety & HACCP</h1>
          <p className="text-muted-foreground mt-1">Real-time IoT temperature monitoring for compliance</p>
        </div>
      </div>

      {activeAlerts.length > 0 && (
        <Card className="border-rose-200 bg-rose-50 shadow-sm">
          <CardContent className="p-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <h3 className="font-bold text-rose-800">Critical Temperature Alerts</h3>
              <p className="text-sm text-rose-700 mt-1">
                {activeAlerts.length} temperature logs have exceeded the safety threshold (41°F) in the last 24 hours. Please inspect the equipment immediately to prevent spoilage.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loadingSensors ? (
          <p className="text-muted-foreground col-span-full">Loading sensors...</p>
        ) : sensors.length === 0 ? (
          <Card className="col-span-full border-dashed">
            <CardContent className="p-12 text-center">
              <ThermometerSnowflake className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-bold">No Sensors Connected</h3>
              <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                Connect Wi-Fi enabled temperature sensors to your walk-in coolers and freezers to automate HACCP compliance.
              </p>
            </CardContent>
          </Card>
        ) : (
          sensors.map(sensor => {
            const latestLog = logs.find(l => l.sensor_id === sensor.id);
            const isLatestAlert = latestLog?.is_alert;
            
            return (
              <Card key={sensor.id} className="relative overflow-hidden group">
                <div className={`absolute top-0 left-0 w-full h-1 ${isLatestAlert ? 'bg-rose-500' : 'bg-teal-500'}`} />
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-foreground truncate">{sensor.name}</span>
                    </div>
                    <Badge className={getStatusColor(sensor.status)}>
                      {sensor.status.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <div className="flex items-end gap-2 mb-2">
                    <span className={`text-4xl font-black tracking-tighter ${isLatestAlert ? 'text-rose-600' : 'text-foreground'}`}>
                      {latestLog ? latestLog.temperature_f : '--'}°
                    </span>
                    <span className="text-muted-foreground mb-1 text-sm font-medium">F</span>
                  </div>
                  
                  <div className="flex justify-between items-center text-xs text-muted-foreground mt-4 pt-4 border-t">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {latestLog ? new Date(latestLog.logged_at).toLocaleTimeString() : 'Never'}
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => simulateIngest(sensor)}>
                      Test Ping
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historical Temperature Logs</CardTitle>
          <CardDescription>Automated HACCP log for health inspectors</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingLogs ? (
             <p className="text-muted-foreground text-sm">Loading logs...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Equipment / Sensor</TableHead>
                  <TableHead>Temperature</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {new Date(log.logged_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{log.iot_sensors?.name}</TableCell>
                    <TableCell className="font-mono">
                      {log.temperature_f}°F
                    </TableCell>
                    <TableCell>
                      {log.is_alert ? (
                        <Badge variant="outline" className="text-rose-600 border-rose-200 bg-rose-50">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          WARNING ( &gt; 41°F )
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-teal-600 border-teal-200 bg-teal-50">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          COMPLIANT
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
