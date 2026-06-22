import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Calendar, Clock, Sparkles, TrendingDown, Users } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function LaborSchedules() {
  const { currentOrganization } = useAuth();
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerateForecast = async () => {
    if (!currentOrganization) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase.functions.invoke('forecast-labor', {
        body: { organization_id: currentOrganization.id, forecast_date: today }
      });
      
      if (error) throw error;
      setForecast(data.data);
      toast.success('AI Labor forecast generated for the week!');
    } catch (err) {
      toast.error('Failed to generate forecast: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Labor & Scheduling</h1>
          <p className="text-slate-500">Manage employee shifts and AI-driven labor forecasts</p>
        </div>
        <Button onClick={handleGenerateForecast} disabled={loading} className="bg-purple-600 hover:bg-purple-700">
          <Sparkles className="w-4 h-4 mr-2" />
          {loading ? 'Generating...' : 'Run AI Forecast'}
        </Button>
      </div>

      {forecast && (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="text-purple-800 flex items-center">
              <Sparkles className="w-5 h-5 mr-2" />
              AI Labor Forecast (Confidence: {forecast.ai_confidence}%)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-purple-100">
              <p className="text-sm text-slate-500 font-medium">Predicted Sales</p>
              <p className="text-2xl font-bold text-slate-900">${forecast.predicted_sales}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-purple-100">
              <p className="text-sm text-slate-500 font-medium">Recommended Labor</p>
              <p className="text-2xl font-bold text-slate-900">{forecast.recommended_labor_hours} hrs</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-purple-100">
              <p className="text-sm text-slate-500 font-medium">Target Labor %</p>
              <p className="text-2xl font-bold text-green-600">20.0%</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Upcoming Shifts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-slate-500">
            <Calendar className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <p>No shifts scheduled yet.</p>
            <Button variant="outline" className="mt-4">Create Schedule</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
