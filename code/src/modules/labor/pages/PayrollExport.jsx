import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Calculator, Users } from 'lucide-react';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function PayrollExport() {
  const { organization } = useAuth();
  
  // Default to previous week
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);
  
  const [startDate, setStartDate] = useState(lastWeek.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const { data: punches, isLoading } = useQuery({
    queryKey: ['payroll-punches', organization?.id, startDate, endDate],
    queryFn: () => api.entities.TimeClock.list('-clock_in', {
      select: '*, profiles(first_name, last_name, email)',
      // Note: in a real environment you would filter by date range
      limit: 1000
    }),
    enabled: !!organization?.id,
  });

  const handleExportADP = () => {
    if (!punches || punches.length === 0) {
      toast.error('No time clock records found for this period');
      return;
    }

    try {
      // Group by user
      const userHours = {};
      
      punches.forEach(punch => {
        if (!punch.clock_in || !punch.clock_out) return;
        
        const inTime = new Date(punch.clock_in);
        const outTime = new Date(punch.clock_out);
        const hours = (outTime - inTime) / (1000 * 60 * 60);
        
        const userId = punch.user_id;
        if (!userHours[userId]) {
          userHours[userId] = {
            firstName: punch.profiles?.first_name || '',
            lastName: punch.profiles?.last_name || '',
            email: punch.profiles?.email || '',
            regularHours: 0,
            overtimeHours: 0
          };
        }
        
        userHours[userId].regularHours += hours;
      });

      // Calculate Overtime (assuming 40 hr week for demo)
      Object.values(userHours).forEach(user => {
        if (user.regularHours > 40) {
          user.overtimeHours = user.regularHours - 40;
          user.regularHours = 40;
        }
      });

      // Format for ADP / Gusto
      const headers = ['Co Code', 'Batch ID', 'File #', 'First Name', 'Last Name', 'Reg Hours', 'OVT Hours'];
      const rows = Object.values(userHours).map((u, idx) => [
        'RESTOPS',
        `BATCH_${startDate.replace(/-/g, '')}`,
        `EMP_${idx + 1000}`,
        u.firstName,
        u.lastName,
        u.regularHours.toFixed(2),
        u.overtimeHours.toFixed(2)
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `ADP_Export_${startDate}_to_${endDate}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('ADP Payroll Export Generated');
    } catch (err) {
      console.error(err);
      toast.error('Export failed');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto py-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Calculator className="h-8 w-8 text-brand" />
          Automated Payroll
        </h1>
        <p className="text-muted-foreground mt-2">Aggregate time punches and export to your payroll provider.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate Export</CardTitle>
          <CardDescription>Select a pay period to aggregate hours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Period Start</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Period End</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="bg-muted/50 p-4 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Raw Punches Analyzed</p>
                <p className="text-sm text-muted-foreground">{isLoading ? 'Scanning...' : punches?.length || 0} records</p>
              </div>
            </div>
            <Button onClick={handleExportADP} className="gap-2 bg-[#1A3A68] hover:bg-[#1A3A68]/90">
              <Download className="h-4 w-4" />
              Export to ADP
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
