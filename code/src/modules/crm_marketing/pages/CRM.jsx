import React, { useState } from 'react';
import { Users, Mail, Award, Search, Send, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export default function CRM() {
  const [activeTab, setActiveTab] = useState('database');
  const [campaignDraft, setCampaignDraft] = useState('');

  // Mock CRM Data
  const customers = [
    { id: 1, name: 'Alice Smith', email: 'alice@example.com', ltv: 1250.00, tier: 'Gold', points: 450, lastVisit: '2026-06-20' },
    { id: 2, name: 'Bob Jones', email: 'bob@example.com', ltv: 340.50, tier: 'Silver', points: 120, lastVisit: '2026-06-15' },
    { id: 3, name: 'Charlie Davis', email: 'charlie@example.com', ltv: 85.00, tier: 'Bronze', points: 30, lastVisit: '2026-06-22' },
  ];

  const handleSendCampaign = () => {
    if (!campaignDraft.trim()) {
      toast.error('Campaign message cannot be empty');
      return;
    }
    toast.success('Campaign dispatched to 3 targeted customers via Resend & Twilio!');
    setCampaignDraft('');
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-8 w-8 text-brand" />
            Marketing & Loyalty CRM
          </h1>
          <p className="text-muted-foreground mt-2">Manage customer relationships, loyalty points, and promotional blasts.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="database" className="gap-2"><Users className="h-4 w-4"/> Customer Database</TabsTrigger>
          <TabsTrigger value="loyalty" className="gap-2"><Award className="h-4 w-4"/> Loyalty Tiers</TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-2"><Mail className="h-4 w-4"/> Campaigns</TabsTrigger>
        </TabsList>

        <TabsContent value="database" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Customer Directory</CardTitle>
                  <CardDescription>All customers who have placed orders.</CardDescription>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search customers..." className="pl-9" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <div className="grid grid-cols-6 bg-muted/50 p-3 text-sm font-medium border-b">
                  <div className="col-span-2">Name & Email</div>
                  <div>Lifetime Value</div>
                  <div>Loyalty Tier</div>
                  <div>Points</div>
                  <div>Last Visit</div>
                </div>
                <div className="divide-y">
                  {customers.map(c => (
                    <div key={c.id} className="grid grid-cols-6 p-3 text-sm items-center hover:bg-muted/30">
                      <div className="col-span-2">
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.email}</p>
                      </div>
                      <div className="font-medium text-emerald-600">${c.ltv.toFixed(2)}</div>
                      <div>
                        <Badge variant="outline" className={
                          c.tier === 'Gold' ? 'border-amber-400 text-amber-600' : 
                          c.tier === 'Silver' ? 'border-slate-400 text-slate-600' : 'border-amber-700 text-amber-800'
                        }>
                          {c.tier}
                        </Badge>
                      </div>
                      <div className="font-mono">{c.points}</div>
                      <div className="text-muted-foreground">{c.lastVisit}</div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loyalty" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-amber-700/30">
              <CardHeader>
                <CardTitle className="text-amber-800">Bronze Tier</CardTitle>
                <CardDescription>0 - 100 Points</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">Perks:</p>
                <ul className="text-sm text-muted-foreground list-disc pl-5 mt-2 space-y-1">
                  <li>Free birthday dessert</li>
                  <li>1 point per $1 spent</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="border-slate-400/30">
              <CardHeader>
                <CardTitle className="text-slate-600">Silver Tier</CardTitle>
                <CardDescription>101 - 300 Points</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">Perks:</p>
                <ul className="text-sm text-muted-foreground list-disc pl-5 mt-2 space-y-1">
                  <li>Free appetizer every month</li>
                  <li>1.5 points per $1 spent</li>
                  <li>Priority seating</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="border-amber-400/50 shadow-md">
              <CardHeader>
                <CardTitle className="text-amber-600">Gold Tier</CardTitle>
                <CardDescription>301+ Points</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">Perks:</p>
                <ul className="text-sm text-muted-foreground list-disc pl-5 mt-2 space-y-1">
                  <li>VIP Chef's Tasting Menu access</li>
                  <li>2 points per $1 spent</li>
                  <li>Free delivery on all orders</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="campaigns" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Draft Promotional Blast</CardTitle>
              <CardDescription>Send SMS or Email promotions directly to customer segments.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Target Segment</label>
                <select className="w-full border rounded-md p-2 bg-background">
                  <option>All Customers</option>
                  <option>Gold Tier Only</option>
                  <option>Missing You (No visit in 30+ days)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Message Body</label>
                <textarea 
                  className="w-full border rounded-md p-3 min-h-[150px] bg-background"
                  placeholder="Hey [Name]! Come back and enjoy 20% off your next order..."
                  value={campaignDraft}
                  onChange={e => setCampaignDraft(e.target.value)}
                />
              </div>
              <Button onClick={handleSendCampaign} className="gap-2">
                <Send className="h-4 w-4" /> Send Campaign
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
