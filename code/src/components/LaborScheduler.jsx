import React, { useState } from 'react';
import { format, addDays, startOfWeek } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Bot, Loader2 } from 'lucide-react';
import { generateLaborSchedule } from '@/lib/geminiService';
import { toast } from 'sonner';
export default function LaborScheduler({ employees, shifts, forecastData, onCreateShift, onEditShift }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Get start of the week (Sunday)
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  
  // Generate 7 days
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  const handlePrevWeek = () => setCurrentDate(addDays(currentDate, -7));
  const handleNextWeek = () => setCurrentDate(addDays(currentDate, 7));

  const handleAutoSchedule = async () => {
    if (!employees || employees.length === 0) {
      toast.error('No employees available to schedule.');
      return;
    }
    
    setIsGenerating(true);
    try {
      const weekStartDateStr = format(weekStart, 'yyyy-MM-dd');
      // If forecastData is missing, pass dummy data for demonstration
      const forecast = forecastData || Array.from({ length: 7 }).map((_, i) => ({
        date: format(addDays(weekStart, i), 'yyyy-MM-dd'),
        salesForecast: 1500 + Math.random() * 2000
      }));
      
      const schedule = await generateLaborSchedule(employees, forecast, weekStartDateStr);
      
      if (schedule && schedule.shifts && schedule.shifts.length > 0) {
        // Since we don't have a bulk API currently, we Promise.all the creations
        // In a real prod scenario, we would add a bulk endpoint
        await Promise.all(schedule.shifts.map(shift => onCreateShift(shift)));
        toast.success(`Generated ${schedule.shifts.length} shifts successfully!`);
      } else {
        toast.error('AI failed to generate any shifts.');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate schedule.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper to find shifts for an employee on a specific date
  const getShiftsForCell = (empId, date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shifts.filter(s => {
      const shiftDate = new Date(s.shift_start);
      return s.employee_id === empId && format(shiftDate, 'yyyy-MM-dd') === dateStr;
    });
  };

  return (
    <Card className="glass-card border-border/50 shadow-sm w-full overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 bg-secondary/50 border-b border-border/50">
        <div>
          <CardTitle className="text-lg">Weekly Schedule</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200 hidden sm:flex"
            onClick={handleAutoSchedule}
            disabled={isGenerating}
          >
            {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bot className="h-4 w-4 mr-2" />}
            Auto-Schedule (AI)
          </Button>
          <Button variant="outline" size="icon" onClick={handlePrevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={handleNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Header Row */}
          <div className="grid grid-cols-[200px_repeat(7,1fr)] bg-muted/30 border-b border-border/50">
            <div className="p-3 font-medium text-sm text-muted-foreground border-r border-border/50">
              Employee
            </div>
            {days.map((day, i) => (
              <div key={i} className="p-3 text-center border-r border-border/50 last:border-0">
                <div className="text-xs font-medium text-muted-foreground uppercase">{format(day, 'EEE')}</div>
                <div className={`text-sm font-bold ${format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'text-primary' : 'text-foreground'}`}>
                  {format(day, 'd')}
                </div>
              </div>
            ))}
          </div>

          {/* Employee Rows */}
          <div className="divide-y divide-border/50">
            {employees.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No employees found to schedule.
              </div>
            ) : (
              employees.map(emp => (
                <div key={emp.id} className="grid grid-cols-[200px_repeat(7,1fr)] group hover:bg-muted/10 transition-colors">
                  <div className="p-3 border-r border-border/50 flex flex-col justify-center">
                    <span className="font-medium text-sm text-foreground truncate" title={emp.full_name}>
                      {emp.full_name}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize truncate">
                      {emp.role?.replace('_', ' ')}
                    </span>
                  </div>
                  
                  {days.map((day, i) => {
                    const cellShifts = getShiftsForCell(emp.id, day);
                    return (
                      <div 
                        key={i} 
                        className="p-2 border-r border-border/50 last:border-0 min-h-[80px] relative cursor-pointer hover:bg-muted/30 transition-colors group/cell"
                        onClick={() => cellShifts.length > 0 ? onEditShift(cellShifts[0]) : onCreateShift(emp.id, day)}
                      >
                        {cellShifts.length > 0 ? (
                          <div className="space-y-1">
                            {cellShifts.map(shift => (
                              <div 
                                key={shift.id} 
                                className="bg-primary/10 border border-primary/20 rounded p-1.5 text-xs"
                                onClick={(e) => { e.stopPropagation(); onEditShift(shift); }}
                              >
                                <div className="font-semibold text-primary">
                                  {format(new Date(shift.shift_start), 'h:mm a')} - 
                                  {shift.shift_end ? format(new Date(shift.shift_end), 'h:mm a') : '...'}
                                </div>
                                <div className="text-muted-foreground mt-0.5 flex justify-between items-center">
                                  <span>{shift.status}</span>
                                  {shift.labor_cost && <span className="font-mono">${Number(shift.labor_cost).toFixed(0)}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="opacity-0 group-hover/cell:opacity-100 absolute inset-0 flex items-center justify-center transition-opacity">
                            <Plus className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
