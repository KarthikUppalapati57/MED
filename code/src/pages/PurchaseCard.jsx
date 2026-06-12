import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, CreditCard, PauseCircle, Plus, Receipt, Search } from 'lucide-react';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { filterByContext } from '@/lib/contextUtils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const today = new Date().toISOString().slice(0, 10);

export default function PurchaseCard() {
  const { user, organization, brand, location, activeBrand, activeLocation } = useAuth();
  const scopedBrand = activeBrand || brand;
  const scopedLocation = activeLocation || location;
  const context = { organization, brand: scopedBrand, location: scopedLocation };
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('transactions');
  const [search, setSearch] = useState('');
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [cardForm, setCardForm] = useState({
    card_name: '',
    cardholder_name: '',
    last_four: '',
    monthly_limit: 0,
    status: 'active',
  });
  const [txForm, setTxForm] = useState({
    card_id: '',
    vendor_id: '',
    transaction_date: today,
    merchant_name: '',
    amount: 0,
    category: 'food',
    match_status: 'unmatched',
    status: 'posted',
    notes: '',
  });

  const { data: cards = [] } = useAuthQuery({
    queryKey: ['purchase-cards', organization?.id],
    queryFn: () => api.entities.PurchaseCard.list('card_name'),
    select: React.useCallback((data) => filterByContext(data, context), [organization, scopedBrand, scopedLocation]),
    enabled: !!organization?.id,
  });

  const { data: transactions = [] } = useAuthQuery({
    queryKey: ['purchase-card-transactions', organization?.id],
    queryFn: () => api.entities.PurchaseCardTransaction.list('-transaction_date'),
    select: React.useCallback((data) => filterByContext(data, context), [organization, scopedBrand, scopedLocation]),
    enabled: !!organization?.id,
  });

  const { data: vendors = [] } = useAuthQuery({
    queryKey: ['vendors', organization?.id],
    queryFn: () => api.entities.Vendor.list('name'),
    select: React.useCallback((data) => filterByContext(data, context), [organization, scopedBrand, scopedLocation]),
    enabled: !!organization?.id,
  });

  const cardMap = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const vendorMap = useMemo(() => new Map(vendors.map((vendor) => [vendor.id, vendor])), [vendors]);

  const stats = useMemo(() => {
    const spend = transactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const needsReview = transactions.filter((tx) => tx.match_status === 'needs_review' || tx.match_status === 'unmatched').length;
    const activeCards = cards.filter((card) => card.status === 'active').length;
    return { spend, needsReview, activeCards };
  }, [cards, transactions]);

  const filteredTransactions = useMemo(() => {
    const term = search.toLowerCase();
    return transactions.filter((tx) => {
      const vendorName = vendorMap.get(tx.vendor_id)?.name || '';
      return !term || tx.merchant_name?.toLowerCase().includes(term) || vendorName.toLowerCase().includes(term);
    });
  }, [transactions, vendorMap, search]);

  const createCardMutation = useMutation({
    mutationFn: (payload) => api.entities.PurchaseCard.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-cards'] });
      toast.success('Purchase card created');
      setCardDialogOpen(false);
      setCardForm({ card_name: '', cardholder_name: '', last_four: '', monthly_limit: 0, status: 'active' });
    },
    onError: (error) => toast.error(error.message || 'Failed to create card'),
  });

  const createTxMutation = useMutation({
    mutationFn: (payload) => api.entities.PurchaseCardTransaction.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-card-transactions'] });
      toast.success('Card transaction added');
      setTxDialogOpen(false);
      setTxForm({
        card_id: '',
        vendor_id: '',
        transaction_date: today,
        merchant_name: '',
        amount: 0,
        category: 'food',
        match_status: 'unmatched',
        status: 'posted',
        notes: '',
      });
    },
    onError: (error) => toast.error(error.message || 'Failed to add transaction'),
  });

  const updateCardMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.PurchaseCard.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-cards'] });
      toast.success('Card updated');
    },
  });

  const updateTxMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.PurchaseCardTransaction.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-card-transactions'] });
      toast.success('Transaction updated');
    },
  });

  const createCard = () => {
    if (!cardForm.card_name.trim()) {
      toast.error('Card name is required');
      return;
    }
    createCardMutation.mutate({
      ...cardForm,
      organization_id: organization?.id,
      brand_id: scopedBrand?.id || null,
      location_id: scopedLocation?.id || null,
      monthly_limit: Number(cardForm.monthly_limit || 0),
      current_spend: 0,
      controls: {},
      created_by: user?.id,
    });
  };

  const createTransaction = () => {
    if (!txForm.merchant_name.trim()) {
      toast.error('Merchant name is required');
      return;
    }
    createTxMutation.mutate({
      ...txForm,
      card_id: txForm.card_id || null,
      vendor_id: txForm.vendor_id || null,
      organization_id: organization?.id,
      brand_id: scopedBrand?.id || null,
      location_id: scopedLocation?.id || null,
      amount: Number(txForm.amount || 0),
      created_by: user?.id,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-brand" />
            Purchase Card
          </h1>
          <p className="text-muted-foreground mt-1">Track restaurant card spend, controls, receipt matching, and review exceptions.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCardDialogOpen(true)}><CreditCard className="h-4 w-4 mr-2" />New Card</Button>
          <Button onClick={() => setTxDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Transaction</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Active Cards</p><p className="text-2xl font-bold">{stats.activeCards}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Current Spend</p><p className="text-2xl font-bold">${stats.spend.toFixed(2)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Needs Review</p><p className="text-2xl font-bold">{stats.needsReview}</p></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="cards">Cards</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search merchant or vendor..." className="pl-9" />
              </div>
            </CardContent>
          </Card>
          <div className="space-y-3">
            {filteredTransactions.map((tx) => {
              const card = cardMap.get(tx.card_id);
              const needsReview = tx.match_status === 'needs_review' || tx.match_status === 'unmatched';
              return (
                <Card key={tx.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{tx.merchant_name}</h3>
                          <Badge variant="outline">{tx.category}</Badge>
                          {needsReview && <Badge className="bg-resend-yellow/10 text-resend-yellow"><AlertTriangle className="h-3 w-3 mr-1" />{tx.match_status}</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {tx.transaction_date} {card ? `- ${card.card_name} ending ${card.last_four || '----'}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-lg font-bold">${Number(tx.amount || 0).toFixed(2)}</p>
                        {tx.match_status !== 'matched' && (
                          <Button size="sm" onClick={() => updateTxMutation.mutate({ id: tx.id, data: { match_status: 'matched', status: 'approved' } })}>
                            <Check className="h-4 w-4 mr-1" />
                            Match
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filteredTransactions.length === 0 && (
              <Card><CardContent className="p-12 text-center text-muted-foreground"><Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />No card transactions yet.</CardContent></Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="cards" className="grid gap-4 lg:grid-cols-2">
          {cards.map((card) => (
            <Card key={card.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{card.card_name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{card.cardholder_name || 'Unassigned'} - {card.last_four ? `ending ${card.last_four}` : 'no card number'}</p>
                  </div>
                  <Badge variant={card.status === 'active' ? 'default' : 'secondary'}>{card.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-muted-foreground">Monthly Limit</p><p className="font-semibold">${Number(card.monthly_limit || 0).toFixed(2)}</p></div>
                  <div><p className="text-muted-foreground">Spend</p><p className="font-semibold">${Number(card.current_spend || 0).toFixed(2)}</p></div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateCardMutation.mutate({ id: card.id, data: { status: card.status === 'active' ? 'paused' : 'active' } })}
                >
                  <PauseCircle className="h-4 w-4 mr-1" />
                  {card.status === 'active' ? 'Pause' : 'Activate'}
                </Button>
              </CardContent>
            </Card>
          ))}
          {cards.length === 0 && (
            <Card className="lg:col-span-2"><CardContent className="p-12 text-center text-muted-foreground"><CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />No cards configured.</CardContent></Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={cardDialogOpen} onOpenChange={setCardDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Purchase Card</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2"><Label>Card Name</Label><Input value={cardForm.card_name} onChange={(e) => setCardForm({ ...cardForm, card_name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Cardholder</Label><Input value={cardForm.cardholder_name} onChange={(e) => setCardForm({ ...cardForm, cardholder_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Last Four</Label><Input maxLength={4} value={cardForm.last_four} onChange={(e) => setCardForm({ ...cardForm, last_four: e.target.value.replace(/\D/g, '') })} /></div>
              <div className="space-y-2"><Label>Monthly Limit</Label><Input type="number" value={cardForm.monthly_limit} onChange={(e) => setCardForm({ ...cardForm, monthly_limit: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCardDialogOpen(false)}>Cancel</Button><Button onClick={createCard}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={txDialogOpen} onOpenChange={setTxDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Card Transaction</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Date</Label><Input type="date" value={txForm.transaction_date} onChange={(e) => setTxForm({ ...txForm, transaction_date: e.target.value })} /></div>
              <div className="space-y-2"><Label>Amount</Label><Input type="number" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Merchant</Label><Input value={txForm.merchant_name} onChange={(e) => setTxForm({ ...txForm, merchant_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Card</Label>
                <Select value={txForm.card_id} onValueChange={(card_id) => setTxForm({ ...txForm, card_id })}>
                  <SelectTrigger><SelectValue placeholder="Select card" /></SelectTrigger>
                  <SelectContent>{cards.map((card) => <SelectItem key={card.id} value={card.id}>{card.card_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Select value={txForm.vendor_id} onValueChange={(vendor_id) => setTxForm({ ...txForm, vendor_id })}>
                  <SelectTrigger><SelectValue placeholder="Optional vendor" /></SelectTrigger>
                  <SelectContent>{vendors.map((vendor) => <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Category</Label><Input value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value })} /></div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setTxDialogOpen(false)}>Cancel</Button><Button onClick={createTransaction}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
