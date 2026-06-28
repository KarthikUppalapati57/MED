import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function ShiftDialog({ open, onOpenChange, shift, employeeId, date }) {
  const { organization, location } = useAuth();
  const queryClient = useQueryClient();

  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [status, setStatus] = useState('scheduled');

  useEffect(() => {
    if (shift) {
      setStartTime(shift.start_time || '09:00');
      setEndTime(shift.end_time || '17:00');
      setStatus(shift.status || 'scheduled');
    } else {
      setStartTime('09:00');
      setEndTime('17:00');
      setStatus('scheduled');
    }
  }, [shift, open]);

  const saveShift = useMutation({
    mutationFn: async () => {
      // Calculate datetime based on date + time string
      const shiftDateStr = date ? format(date, 'yyyy-MM-dd') : format(new Date(shift.shift_start), 'yyyy-MM-dd');
      const startDateTime = `${shiftDateStr}T${startTime}:00`;
      const endDateTime = `${shiftDateStr}T${endTime}:00`;

      const payload = {
        organization_id: organization?.id,
        location_id: location?.id || null,
        employee_id: shift ? shift.employee_id : employeeId,
        shift_start: startDateTime,
        shift_end: endDateTime,
        start_time: startTime,
        end_time: endTime,
        status: status,
      };

      if (shift) {
        return api.entities.EmployeeShift.update(shift.id, payload);
      } else {
        return api.entities.EmployeeShift.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee_shifts'] });
      toast.success(`Shift ${shift ? 'updated' : 'scheduled'} successfully`);
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message || 'Failed to save shift')
  });

  const deleteShift = useMutation({
    mutationFn: async () => {
      if (!shift) return;
      return api.entities.EmployeeShift.delete(shift.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee_shifts'] });
      toast.success('Shift removed');
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message || 'Failed to delete shift')
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{shift ? 'Edit Shift' : 'Schedule Shift'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="no_show">No Show</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between items-center w-full">
          {shift ? (
            <Button variant="destructive" size="sm" onClick={() => deleteShift.mutate()} disabled={deleteShift.isPending}>
              Delete
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => saveShift.mutate()} disabled={saveShift.isPending}>
              {saveShift.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
