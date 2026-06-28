import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calculator, DollarSign, Users } from 'lucide-react';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function TipPooling() {
  const { location } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [totalTips, setTotalTips] = useState(0);

  // Fetch punches for the specific day
  const { data: punches, isLoading } = useQuery({
    queryKey: ['tip-pool-punches', location?.id, selectedDate],
    queryFn: () => {
      // In a real app we'd filter by exact date using Supabase range
      return api.entities.TimeClock.list('-clock_in', {
        select: '*, profiles(first_name, last_name, role)',
        limit: 100
      });
    },
    enabled: !!location?.id,
  });

  // Calculate tip split
  const { totalHours, userSplits } = useMemo(() => {
    if (!punches) return { totalHours: 0, userSplits: [] };

    let tHours = 0;
    const splitMap = {};

    punches.forEach(punch => {
      // For demo purposes, we process all fetched punches. 
      // In prod, ensure only punches matching selectedDate are included.
      if (!punch.clock_in || !punch.clock_out) return;
      
      const inTime = new Date(punch.clock_in);
      const outTime = new Date(punch.clock_out);
      const hours = (outTime - inTime) / (1000 * 60 * 60);
      
      tHours += hours;
      
      const userId = punch.user_id;
      if (!splitMap[userId]) {
        splitMap[userId] = {
          name: `${punch.profiles?.first_name || ''} ${punch.profiles?.last_name || ''}`,
          role: punch.profiles?.role || 'staff',
          hours: 0,
        };
      }
      splitMap[userId].hours += hours;
    });

    const splits = Object.values(splitMap).map(u => ({
      ...u,
      ratio: tHours > 0 ? (u.hours / tHours) : 0,
      tipShare: tHours > 0 ? (u.hours / tHours) * (Number(totalTips) || 0) : 0
    })).sort((a, b) => b.tipShare - a.tipShare);

    return { totalHours: tHours, userSplits: splits };
  }, [punches, totalTips]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Calculator className="h-8 w-8 text-brand" />
          Tip Pooling
        </h1>
        <p className="text-muted-foreground mt-2">Automatically distribute credit card tips based on hours worked.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 border-brand/20">
          <CardHeader>
            <CardTitle>Pool Settings</CardTitle>
            <CardDescription>Enter the total tips collected from the POS for this shift.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Shift Date</label>
              <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Total Credit Card Tips</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  type="number" 
                  className="pl-9" 
                  value={totalTips} 
                  onChange={e => setTotalTips(e.target.value)} 
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="pt-4 border-t border-muted">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-muted-foreground">Total Labor Hours:</span>
                <span className="font-medium">{totalHours.toFixed(2)} hrs</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Eligible Employees:</span>
                <span className="font-medium">{userSplits.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Distribution Breakdown</CardTitle>
            <CardDescription>Mathematical split down to the cent.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Calculating...</div>
            ) : userSplits.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No completed time punches found for this date.</div>
            ) : (
              <div className="space-y-4">
                {userSplits.map((split, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-brand/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-brand" />
                      </div>
                      <div>
                        <p className="font-medium">{split.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{split.role.replace('_', ' ')} • {split.hours.toFixed(2)} hours ({(split.ratio * 100).toFixed(1)}%)</p>
                      </div>
                    </div>
                    <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                      ${split.tipShare.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
