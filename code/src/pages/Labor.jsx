import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Clock, DollarSign, TrendingUp, AlertTriangle, Calendar, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from "@/components/ui/badge";

export default function Labor() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'summary';
  const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });
  const { data: employees = [], isLoading: loadingEmployees } = useAuthQuery({
    queryKey: ['employees'],
    queryFn: () => api.entities.Employee.list('-created_at'),
  });

  const { data: shifts = [], isLoading: loadingShifts } = useAuthQuery({
    queryKey: ['employee_shifts'],
    queryFn: () => api.entities.EmployeeShift.list('-shift_start'),
  });

  const totalEmployees = employees.length;
  const activeShifts = shifts.filter(s => s.status === 'in_progress').length;
  const totalLaborCost = shifts.reduce((sum, shift) => sum + (Number(shift.labor_cost) || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in-scale">
      <div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Labor Management</h1>
        <p className="text-muted-foreground mt-1 text-lg">Track employees, shifts, and labor costs.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-6">
          <TabsTrigger value="summary">Labor Summary</TabsTrigger>
          <TabsTrigger value="shifts">Shifts & Scheduling</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
            <Card className="glass-card border-border/50 shadow-sm">
              <CardContent className="p-4 flex flex-col justify-center h-full">
                <p className="text-sm font-medium text-muted-foreground mb-1">Labor % of Sales</p>
                <div className="flex items-center gap-2">
                  <h3 className="text-3xl font-bold text-foreground">28.4%</h3>
                  <Badge className="bg-resend-green/10 text-resend-green">-1.2%</Badge>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card border-border/50 shadow-sm">
              <CardContent className="p-4 flex flex-col justify-center h-full">
                <p className="text-sm font-medium text-muted-foreground mb-1">Scheduled vs Actual</p>
                <div className="flex items-center gap-2">
                  <h3 className="text-3xl font-bold text-foreground">+4.5 hrs</h3>
                  <Badge className="bg-resend-red/10 text-resend-red">Over</Badge>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card border-border/50 shadow-sm">
              <CardContent className="p-4 flex flex-col justify-center h-full">
                <p className="text-sm font-medium text-muted-foreground mb-1">Total Labor Cost</p>
                <h3 className="text-3xl font-bold text-foreground">${totalLaborCost.toFixed(2)}</h3>
              </CardContent>
            </Card>
            <Card className="glass-card border-border/50 shadow-sm">
              <CardContent className="p-4 flex flex-col justify-center h-full">
                <p className="text-sm font-medium text-muted-foreground mb-1">Active Shifts</p>
                <h3 className="text-3xl font-bold text-foreground">{activeShifts}</h3>
              </CardContent>
            </Card>
            <Card className="glass-card border-border/50 shadow-sm bg-resend-red/5 border-resend-red/20">
              <CardContent className="p-4 flex flex-col justify-center h-full">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-resend-red" />
                  <p className="text-sm font-medium text-resend-red">Overtime Risk</p>
                </div>
                <h3 className="text-2xl font-bold text-resend-red">3 Staff</h3>
                <p className="text-xs text-resend-red mt-1">Approaching 40hrs</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="glass-card border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Recent Shifts</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingShifts ? (
                  <p className="text-muted-foreground text-sm">Loading shifts...</p>
                ) : shifts.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No recent shifts logged.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Start Time</TableHead>
                        <TableHead>End Time</TableHead>
                        <TableHead>Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shifts.slice(0, 5).map(shift => (
                        <TableRow key={shift.id}>
                          <TableCell>{format(new Date(shift.shift_start), 'MMM dd, yyyy')}</TableCell>
                          <TableCell>{format(new Date(shift.shift_start), 'h:mm a')}</TableCell>
                          <TableCell>{shift.shift_end ? format(new Date(shift.shift_end), 'h:mm a') : 'Ongoing'}</TableCell>
                          <TableCell>${Number(shift.labor_cost).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="shifts">
          <Card className="glass-card border-border/50 shadow-sm p-8 text-center text-muted-foreground">
            Schedule builder and shift variance tools in development.
          </Card>
        </TabsContent>

        <TabsContent value="employees">
          <Card className="glass-card border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Staff Roster</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingEmployees ? (
                <p className="text-muted-foreground text-sm">Loading staff...</p>
              ) : employees.length === 0 ? (
                <p className="text-muted-foreground text-sm">No employees found. Add staff to get started.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Hourly Rate</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map(emp => (
                      <TableRow key={emp.id}>
                        <TableCell className="font-medium">{emp.full_name}</TableCell>
                        <TableCell className="capitalize">{emp.role?.replace('_', ' ')}</TableCell>
                        <TableCell>${Number(emp.hourly_rate).toFixed(2)}/hr</TableCell>
                        <TableCell>
                          <Badge className={emp.status === 'active' ? 'bg-resend-green/10 text-resend-green' : 'bg-muted text-muted-foreground'}>
                            {emp.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup">
          <Card className="glass-card border-border/50 shadow-sm p-8 text-center text-muted-foreground">
            Labor settings, POS mapping, and overtime rules configuration in development.
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
