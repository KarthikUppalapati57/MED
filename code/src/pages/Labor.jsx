import React, { useState } from 'react';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Clock, DollarSign, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

export default function Labor() {
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

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6 flex flex-row items-center gap-4">
            <div className="p-3 bg-brand/10 rounded-xl">
              <Users className="h-6 w-6 text-brand" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Staff</p>
              <h3 className="text-2xl font-bold text-foreground">{totalEmployees}</h3>
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6 flex flex-row items-center gap-4">
            <div className="p-3 bg-resend-blue/10 rounded-xl">
              <Clock className="h-6 w-6 text-resend-blue" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Shifts</p>
              <h3 className="text-2xl font-bold text-foreground">{activeShifts}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6 flex flex-row items-center gap-4">
            <div className="p-3 bg-resend-red/10 rounded-xl">
              <DollarSign className="h-6 w-6 text-resend-red" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Period Labor Cost</p>
              <h3 className="text-2xl font-bold text-foreground">${totalLaborCost.toFixed(2)}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6 flex flex-row items-center gap-4">
            <div className="p-3 bg-resend-green/10 rounded-xl">
              <TrendingUp className="h-6 w-6 text-resend-green" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Efficiency</p>
              <h3 className="text-2xl font-bold text-foreground">94%</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
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
                        <span className={`px-2 py-1 rounded-full text-xs ${emp.status === 'active' ? 'bg-resend-green/10 text-resend-green' : 'bg-muted text-muted-foreground'}`}>
                          {emp.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

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
    </div>
  );
}
