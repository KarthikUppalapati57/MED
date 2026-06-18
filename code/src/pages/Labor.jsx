import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthQuery, useAuthInfiniteQuery } from '@/hooks/useAuthQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { supabase } from '@/lib/supabaseClient';
import { filterByContext } from '@/lib/contextUtils';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Sparkles, Search, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import LaborScheduler from '@/components/LaborScheduler';
import ShiftDialog from '@/components/ShiftDialog';

export default function Labor() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'summary';
  const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });
  const { organization, brand, location } = useAuth();
  const queryClient = useQueryClient();
  const needsEmployees = ['summary', 'shifts', 'employees'].includes(activeTab);
  const needsShifts = ['summary', 'shifts'].includes(activeTab);
  const needsForecast = activeTab === 'summary';

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const [sortEmployees, setSortEmployees] = useState('full_name');
  const [sortShifts, setSortShifts] = useState('-shift_start');

  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);

  const handleCreateShift = (empId, date) => {
    setSelectedEmployeeId(empId);
    setSelectedDate(date);
    setSelectedShift(null);
    setShiftDialogOpen(true);
  };

  const handleEditShift = (shift) => {
    setSelectedShift(shift);
    setShiftDialogOpen(true);
  };

  const {
    data: employeesData,
    isLoading: loadingEmployees,
    fetchNextPage: fetchNextEmployeesPage,
    hasNextPage: hasNextEmployeesPage,
    isFetchingNextPage: isFetchingNextEmployeesPage
  } = useAuthInfiniteQuery({
    queryKey: ['employees', organization?.id, debouncedSearch, sortEmployees],
    queryFn: ({ pageParam = 0 }) => api.entities.Employee.list(sortEmployees, {
      page: pageParam,
      pageSize: 50,
      search: debouncedSearch,
      searchColumn: 'first_name',
      select: 'id, organization_id, location_id, full_name, role, status, hourly_rate, created_at',
    }),
    select: React.useCallback((data) => ({
      pages: data.pages.map(page => filterByContext(page.data || page, { organization, brand, location })),
      pageParams: data.pageParams,
    }), [organization, brand, location]),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
    enabled: !!organization?.id && needsEmployees,
  });

  const employees = React.useMemo(() => employeesData?.pages.flat() || [], [employeesData]);

  const {
    data: shiftsData,
    isLoading: loadingShifts,
    fetchNextPage: fetchNextShiftsPage,
    hasNextPage: hasNextShiftsPage,
    isFetchingNextPage: isFetchingNextShiftsPage
  } = useAuthInfiniteQuery({
    queryKey: ['employee_shifts', organization?.id, sortShifts],
    queryFn: ({ pageParam = 0 }) => api.entities.EmployeeShift.list(sortShifts, {
      page: pageParam,
      pageSize: 50,
      select: 'id, organization_id, location_id, employee_id, shift_start, shift_end, start_time, end_time, status, labor_cost, created_at',
    }),
    select: React.useCallback((data) => ({
      pages: data.pages.map(page => filterByContext(page.data || page, { organization, brand, location })),
      pageParams: data.pageParams,
    }), [organization, brand, location]),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
    enabled: !!organization?.id && needsShifts,
  });

  const shifts = React.useMemo(() => shiftsData?.pages.flat() || [], [shiftsData]);

  useEffect(() => {
    const channel = supabase.channel('labor-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
        queryClient.invalidateQueries({ queryKey: ['employees', organization?.id] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_shifts' }, () => {
        queryClient.invalidateQueries({ queryKey: ['employee_shifts', organization?.id] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const totalEmployees = employees.length;
  const activeShifts = shifts.filter(s => s.status === 'in_progress').length;
  const totalLaborCost = shifts.reduce((sum, shift) => sum + (Number(shift.labor_cost) || 0), 0);

  const { data: forecastData = [] } = useAuthQuery({
    queryKey: ['labor_forecast', location?.id],
    queryFn: async () => {
      if (!location?.id) return [];
      const { data, error } = await supabase.rpc('get_labor_forecast', {
        p_location_id: location.id
      });
      if (error) {
        console.error('Failed to load forecast', error);
        return [];
      }
      return data || [];
    },
    enabled: !!location?.id && needsForecast
  });

  const externalFactors = [
    { name: 'Weather', impact: '-15% (Heavy Rain)', active: true, color: 'bg-resend-blue', textClass: 'text-resend-blue' },
    { name: 'Local Event', impact: '+20% (Concert)', active: false, color: 'bg-purple-500', textClass: 'text-purple-500' },
    { name: 'Holiday', impact: '+30% (Long Weekend)', active: true, color: 'bg-resend-green', textClass: 'text-resend-green' },
  ];

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
                      {shifts.map(shift => (
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
                {hasNextShiftsPage && (
                  <div className="flex justify-center mt-4">
                    <Button variant="outline" onClick={() => fetchNextShiftsPage()} disabled={isFetchingNextShiftsPage}>
                      {isFetchingNextShiftsPage ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Load More
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="shifts" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-3">
              <LaborScheduler
                employees={employees}
                shifts={shifts}
                forecastData={forecastData}
                onCreateShift={handleCreateShift}
                onEditShift={handleEditShift}
              />
            </div>
            <div className="lg:col-span-2">
              <Card className="glass-card border-border/50 shadow-sm h-full">
                <CardHeader>
                  <CardTitle>POS Sales vs. Labor Forecast</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={forecastData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorLabor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" />
                      <YAxis />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="salesForecast" name="Forecasted Sales" stroke="#22c55e" fillOpacity={1} fill="url(#colorSales)" />
                      <Area type="monotone" dataKey="scheduledLabor" name="Scheduled Labor" stroke="#6366f1" fillOpacity={1} fill="url(#colorLabor)" />
                      <Area type="monotone" dataKey="suggestedLabor" name="AI Suggested Labor" stroke="#f59e0b" fillOpacity={0} strokeDasharray="5 5" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
            <div className="space-y-6">
              <Card className="glass-card border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">AI External Factors</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Factors automatically adjusting the labor suggestion</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {externalFactors.map((factor, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`h-2.5 w-2.5 rounded-full ${factor.active ? factor.color : 'bg-muted'}`} />
                        <div>
                          <p className={`font-medium ${factor.active ? 'text-foreground' : 'text-muted-foreground'}`}>{factor.name}</p>
                          {factor.active && (
                            <p className={`text-xs font-semibold mt-1 ${factor.textClass}`}>
                              {factor.impact}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline">{factor.active ? 'Active' : 'Inactive'}</Badge>
                    </div>
                  ))}
                  <Button
                    className="w-full mt-4 bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={() => {
                      setActiveTab('shifts');
                      toast.info('Forecast opened in scheduling for review before applying.');
                    }}
                  >
                    Apply Forecast to Schedule
                  </Button>
                </CardContent>
              </Card>

              <Card className="glass-card border-border/50 shadow-sm bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-5 w-5 text-indigo-500" />
                    <h3 className="font-semibold text-foreground">Smart Tip</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    You are overstaffed by approx 4.5 hours on Tuesday. Consider cutting a prep shift early to save $110 in labor costs.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="employees">
          <Card className="glass-card border-border/50 shadow-sm">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="text-lg">Staff Roster</CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search first name..."
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
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
                      <TableHead
                        className="cursor-pointer hover:text-foreground group"
                        onClick={() => setSortEmployees(sortEmployees === 'full_name' ? '-full_name' : 'full_name')}
                      >
                        <div className="flex items-center gap-1">
                          Name
                          <span className="opacity-0 group-hover:opacity-100 text-xs">
                            {sortEmployees === 'full_name' ? '↑' : sortEmployees === '-full_name' ? '↓' : '↕'}
                          </span>
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground group"
                        onClick={() => setSortEmployees(sortEmployees === 'role' ? '-role' : 'role')}
                      >
                        <div className="flex items-center gap-1">
                          Role
                          <span className="opacity-0 group-hover:opacity-100 text-xs">
                            {sortEmployees === 'role' ? '↑' : sortEmployees === '-role' ? '↓' : '↕'}
                          </span>
                        </div>
                      </TableHead>
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
              {hasNextEmployeesPage && (
                <div className="flex justify-center mt-6">
                  <Button variant="outline" onClick={() => fetchNextEmployeesPage()} disabled={isFetchingNextEmployeesPage}>
                    {isFetchingNextEmployeesPage ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Load More Employees
                  </Button>
                </div>
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

      <ShiftDialog
        open={shiftDialogOpen}
        onOpenChange={setShiftDialogOpen}
        shift={selectedShift}
        employeeId={selectedEmployeeId}
        date={selectedDate}
      />
    </div>
  );
}
