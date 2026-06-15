import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Target, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

export default function PeriodBudgetsTab() {
  const { organization } = useAuth();
  const queryClient = useQueryClient();
  const [editingCategory, setEditingCategory] = useState(null);
  const [budgetLimit, setBudgetLimit] = useState('');

  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ['budgets', organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('organization_id', organization?.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const categories = ['food', 'bev', 'supplies', 'labor', 'maintenance'];

  const getBudgetForCategory = (cat) => budgets.find(b => b.gl_category === cat);

  const saveBudget = async (category) => {
    try {
      const val = parseFloat(budgetLimit) || 0;
      
      const existing = getBudgetForCategory(category);
      if (existing) {
        await supabase.from('budgets').update({ budget_limit: val }).eq('id', existing.id);
      } else {
        await supabase.from('budgets').insert({
          organization_id: organization.id,
          gl_category: category,
          budget_limit: val
        });
      }
      
      toast.success(`${category} budget updated to $${val}`);
      setEditingCategory(null);
      setBudgetLimit('');
      queryClient.invalidateQueries(['budgets']);
    } catch (e) {
      toast.error('Failed to save budget.');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-teal-800">
            <Target className="w-5 h-5 mr-2 text-teal-600" />
            Period-Based Budgets
          </CardTitle>
          <CardDescription>
            Set hard dollar limits for GL categories. These limits feed into real-time operational guardrails.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-muted-foreground h-6 w-6" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Budget Limit ($)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map(cat => {
                  const budget = getBudgetForCategory(cat);
                  const isEditing = editingCategory === cat;
                  
                  return (
                    <TableRow key={cat}>
                      <TableCell className="font-medium capitalize">{cat}</TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input 
                            type="number" 
                            className="w-32 bg-white" 
                            value={budgetLimit} 
                            onChange={(e) => setBudgetLimit(e.target.value)} 
                            placeholder="e.g. 5000"
                            autoFocus
                          />
                        ) : (
                          <span className="text-lg">${budget?.budget_limit?.toFixed(2) || '0.00'}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {budget ? (
                          <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-slate-50 text-slate-500">Unset</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => saveBudget(cat)}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingCategory(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => {
                            setEditingCategory(cat);
                            setBudgetLimit(budget?.budget_limit || '');
                          }}>
                            Edit Limit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
