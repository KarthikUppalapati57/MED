import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Clock, RefreshCcw, UserCircle2, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function ShiftBoard() {
  const { location, user } = useAuth();
  const queryClient = useQueryClient();

  // Mocking the shift data for the trade board
  // In production, this would query a `shift_trades` table joined with `labor_schedules`
  const [trades, setTrades] = useState([
    {
      id: 'trade-1',
      date: '2026-06-25',
      time: '09:00 AM - 05:00 PM',
      role: 'Prep Cook',
      owner_name: 'John Doe',
      owner_id: 'user-2',
      status: 'open',
      claimed_by: null
    },
    {
      id: 'trade-2',
      date: '2026-06-26',
      time: '04:00 PM - 11:30 PM',
      role: 'Line Cook',
      owner_name: 'Jane Smith',
      owner_id: 'user-3',
      status: 'claimed',
      claimed_by: 'user-4',
      claimed_name: 'Alex Johnson'
    }
  ]);

  const handleClaim = (tradeId) => {
    setTrades(prev => prev.map(t => 
      t.id === tradeId ? { ...t, status: 'claimed', claimed_by: user.id, claimed_name: 'You' } : t
    ));
    toast.success("Shift claimed! Awaiting manager approval.");
  };

  const handleApprove = (tradeId) => {
    setTrades(prev => prev.filter(t => t.id !== tradeId));
    toast.success("Shift trade approved. Roster updated.");
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <RefreshCcw className="h-8 w-8 text-brand" />
            Shift Trade Board
          </h1>
          <p className="text-muted-foreground mt-2">Drop shifts or pick up extra hours.</p>
        </div>
        <Button className="gap-2">
          <Calendar className="h-4 w-4" />
          Drop a Shift
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {trades.map(trade => (
          <Card key={trade.id} className="border-brand/20 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3 border-b border-muted">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    {trade.date}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1 mt-1 font-medium text-slate-800 dark:text-slate-200">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {trade.time}
                  </CardDescription>
                </div>
                <Badge variant={trade.status === 'open' ? 'default' : 'secondary'} className={trade.status === 'open' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}>
                  {trade.status.toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <UserCircle2 className="h-5 w-5 text-muted-foreground" />
                    <span className="text-muted-foreground">Offered by:</span>
                  </div>
                  <span className="font-semibold">{trade.owner_name}</span>
                </div>
                
                <div className="flex justify-between items-center text-sm pb-4 border-b border-muted">
                  <span className="text-muted-foreground">Required Role:</span>
                  <Badge variant="outline">{trade.role}</Badge>
                </div>

                {trade.status === 'open' && trade.owner_id !== user.id && (
                  <Button onClick={() => handleClaim(trade.id)} className="w-full bg-brand hover:bg-brand/90">
                    Claim This Shift
                  </Button>
                )}

                {trade.status === 'claimed' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center text-sm bg-amber-500/10 p-2 rounded text-amber-600 border border-amber-500/20">
                      <span className="flex items-center gap-2"><Clock className="h-4 w-4"/> Pending Approval</span>
                      <span className="font-medium">Claimed by {trade.claimed_name}</span>
                    </div>
                    {/* In reality, only managers see this button */}
                    <Button onClick={() => handleApprove(trade.id)} variant="outline" className="w-full border-emerald-500 text-emerald-600 hover:bg-emerald-50">
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Manager: Approve Trade
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {trades.length === 0 && (
          <div className="col-span-full p-12 text-center text-muted-foreground border-2 border-dashed rounded-xl">
            No shifts are currently up for trade.
          </div>
        )}
      </div>
    </div>
  );
}
