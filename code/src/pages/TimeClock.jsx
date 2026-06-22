import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Clock, KeyRound } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function TimeClock() {
  const { currentOrganization } = useAuth();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePunch = async (action) => {
    if (!pin) {
      toast.error('Please enter your PIN');
      return;
    }
    
    setLoading(true);
    try {
      // In a real app, we'd verify the PIN against the profile table to get employee_id
      // For this demo, we'll assume the logged in user is punching their own card
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('Not authenticated');

      if (action === 'in') {
        const { error } = await supabase.from('time_clocks').insert({
          organization_id: currentOrganization.id,
          employee_profile_id: user.data.user.id,
          status: 'clocked_in'
        });
        if (error) throw error;
        toast.success('Successfully clocked IN');
      } else {
        const { error } = await supabase.from('time_clocks')
          .update({ 
            clock_out_time: new Date().toISOString(),
            status: 'clocked_out'
          })
          .eq('employee_profile_id', user.data.user.id)
          .eq('status', 'clocked_in');
        
        if (error) throw error;
        toast.success('Successfully clocked OUT');
      }
      setPin('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto space-y-6 mt-12">
      <div className="text-center mb-8">
        <Clock className="w-16 h-16 mx-auto text-blue-600 mb-4" />
        <h1 className="text-3xl font-bold text-slate-900">Time Clock</h1>
        <p className="text-slate-500">Enter your PIN to clock in or out</p>
      </div>

      <Card className="shadow-lg border-t-4 border-t-blue-600">
        <CardContent className="pt-6 space-y-6">
          <div className="relative">
            <KeyRound className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <Input
              type="password"
              placeholder="Enter PIN"
              className="pl-10 text-center text-2xl tracking-widest h-12"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              maxLength={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Button 
              size="lg" 
              className="bg-green-600 hover:bg-green-700"
              onClick={() => handlePunch('in')}
              disabled={loading}
            >
              Clock In
            </Button>
            <Button 
              size="lg" 
              variant="destructive"
              onClick={() => handlePunch('out')}
              disabled={loading}
            >
              Clock Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
