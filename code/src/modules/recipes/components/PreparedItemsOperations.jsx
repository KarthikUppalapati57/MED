import React, { useMemo, useState } from 'react';
import { Download, Edit2, Eye, FileText, Plus, Power, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { useConfirmation } from '@/hooks/useConfirmation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { filterPreparedItems, preparedItemsCsv } from '@/modules/recipes/lib/preparedItemsDomain';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function PreparedItemsOperations({ recipes, recipeTypes, onAdd, onView, onEdit, onChanged }) {
  const { confirm } = useConfirmation();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('active');
  const [selected, setSelected] = useState([]);
  const items = useMemo(() => filterPreparedItems(recipes, { search, type, status }), [recipes, search, type, status]);
  const typeMap = useMemo(() => new Map((recipeTypes || []).map((row) => [row.id, row.name])), [recipeTypes]);

  const exportCsv = () => {
    const rows = selected.length ? items.filter((item) => selected.includes(item.id)) : items;
    const url = URL.createObjectURL(new Blob([preparedItemsCsv(rows.map((item) => ({ ...item, recipe_type_name: typeMap.get(item.recipe_type_id) })))], { type: 'text/csv' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'prepared-items.csv'; anchor.click(); URL.revokeObjectURL(url);
  };
  const print = () => window.print();
  const deactivate = async (item) => {
    const ok = await confirm({ title: `Deactivate ${item.name}?`, description: 'This component will remain in existing recipes, but it will no longer be available for new selections.', confirmText: 'Deactivate', cancelText: 'Cancel', variant: 'warning', severity: 'high' });
    if (!ok) return;
    try { await api.recipes.deactivatePreparedItem(item.id); toast.success('Prepared Item deactivated'); onChanged(); }
    catch (error) { toast.error(error.message || 'Unable to deactivate Prepared Item'); }
  };
  const remove = async (item) => {
    let dependencies = [];
    try { dependencies = await api.recipes.getPreparedItemDependencies(item.id); } catch { /* migration fallback below */ }
    if (dependencies.length) { toast.error(`${item.name} is used in ${dependencies.length} recipe${dependencies.length === 1 ? '' : 's'} and cannot be deleted.`); return; }
    const ok = await confirm({ title: `Delete ${item.name}?`, description: 'This permanently removes the unused Prepared Item, its yields, preparation steps, and cost history.', confirmText: 'Delete Prepared Item', cancelText: 'Cancel', variant: 'destructive', severity: 'critical' });
    if (!ok) return;
    try { await api.recipes.deletePreparedItem(item.id); toast.success('Prepared Item deleted'); onChanged(); }
    catch (error) { toast.error(error.message || 'Unable to delete Prepared Item'); }
  };

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-semibold">Prepared Items</h1><p className="text-sm text-muted-foreground">Reusable batch recipes that roll their cost into finished Menu Items.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={print}><FileText className="mr-2 h-4 w-4" />Print</Button><Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button><Button onClick={onAdd}><Plus className="mr-2 h-4 w-4" />Add Prepared Item</Button></div></div>
    <Card><CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_220px_180px]"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="pl-9" placeholder="Search prepared items" value={search} onChange={(e)=>setSearch(e.target.value)}/></div><Select value={type} onValueChange={setType}><SelectTrigger><SelectValue placeholder="All types"/></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{(recipeTypes || []).filter((row)=>row.kind === 'component').map((row)=><SelectItem value={row.id} key={row.id}>{row.name}</SelectItem>)}</SelectContent></Select><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></CardContent></Card>
    <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">Batch recipe library</CardTitle><span className="text-sm text-muted-foreground">{items.length} item{items.length === 1 ? '' : 's'}</span></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead className="w-12"><Checkbox checked={items.length > 0 && selected.length === items.length} onCheckedChange={(checked)=>setSelected(checked ? items.map((item)=>item.id) : [])}/></TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Primary yield</TableHead><TableHead>Batch cost</TableHead><TableHead>Cost / yield</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{items.length ? items.map((item)=><TableRow key={item.id}><TableCell><Checkbox checked={selected.includes(item.id)} onCheckedChange={(checked)=>setSelected(checked ? [...selected,item.id] : selected.filter((id)=>id!==item.id))}/></TableCell><TableCell className="font-medium">{item.name}</TableCell><TableCell><Badge variant="secondary">{typeMap.get(item.recipe_type_id) || 'Unclassified'}</Badge></TableCell><TableCell className="capitalize">{item.status}</TableCell><TableCell>{Number(item.yield_quantity || 0)} {item.yield_unit || 'each'}</TableCell><TableCell>{money.format(Number(item.total_cost || 0))}</TableCell><TableCell>{money.format(Number(item.cost_per_serving || 0))}</TableCell><TableCell><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" aria-label={`View ${item.name}`} onClick={()=>onView(item)}><Eye className="h-4 w-4"/></Button><Button size="icon" variant="ghost" aria-label={`Edit ${item.name}`} onClick={()=>onEdit(item)}><Edit2 className="h-4 w-4"/></Button>{item.status === 'active' && <Button size="icon" variant="ghost" aria-label={`Deactivate ${item.name}`} onClick={()=>deactivate(item)}><Power className="h-4 w-4"/></Button>}<Button size="icon" variant="ghost" aria-label={`Delete ${item.name}`} onClick={()=>remove(item)}><Trash2 className="h-4 w-4"/></Button></div></TableCell></TableRow>) : <TableRow><TableCell colSpan={8} className="py-10 text-center"><div className="flex flex-col items-center gap-2 text-muted-foreground"><p>No Prepared Items match these filters.</p><Button type="button" size="sm" onClick={onAdd}><Plus className="mr-2 h-4 w-4" /> Add Prepared Item</Button></div></TableCell></TableRow>}</TableBody></Table></CardContent></Card>
  </div>;
}
