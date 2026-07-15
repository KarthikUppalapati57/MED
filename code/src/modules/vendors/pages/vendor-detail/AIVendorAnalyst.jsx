import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { generateVendorInsights, chatAboutVendor } from '@/lib/geminiService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Send, Bot, User } from 'lucide-react';

export default function AIVendorAnalyst({ vendorId }) {
  const { organization } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  const { data: vendor } = useQuery({
    queryKey: ['vendor', vendorId],
    queryFn: () => api.entities.Vendor.get(vendorId),
    enabled: !!vendorId,
  });

  const { data: vendorItems = [] } = useQuery({
    queryKey: ['vendor_items_insights', vendorId, vendor?.organization_id],
    queryFn: () => api.entities.VendorItem.filter({ vendor_id: vendorId, organization_id: vendor?.organization_id }),
    enabled: !!vendorId && !!vendor?.organization_id,
  });

  const { data: recentInvoices = [] } = useQuery({
    queryKey: ['vendor_invoices_insights', vendorId, vendor?.organization_id],
    queryFn: () => api.entities.Invoice.filter(
      { vendor_id: vendorId, organization_id: vendor?.organization_id },
      { select: 'invoice_date, total_amount, payment_status', orderBy: '-invoice_date', limit: 20 }
    ),
    enabled: !!vendorId && !!vendor?.organization_id,
  });

  const dataReady = !!vendor;

  // Load real opening insights once the vendor's data has arrived.
  useEffect(() => {
    if (!dataReady || messages.length > 0) return;
    setIsLoading(true);
    generateVendorInsights(vendor, vendorItems, recentInvoices)
      .then((result) => {
        const insights = result?.insights || [];
        if (insights.length === 0) {
          setMessages([{ role: 'assistant', content: "I don't have enough data on this vendor yet to generate insights." }]);
        } else {
          setMessages(insights.map(i => ({ role: 'assistant', content: `${i.title}: ${i.description}` })));
        }
      })
      .catch((err) => {
        setMessages([{ role: 'assistant', content: err.message === 'Gemini API key is not configured.' ? err.message : `I couldn't analyze this vendor: ${err.message}` }]);
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || !dataReady) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const reply = await chatAboutVendor(vendor, vendorItems, recentInvoices, userMessage.content);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: `I'm sorry, I encountered an error: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const predefinedQueries = [
    "Which items increased in price this month?",
    "Show me unpaid invoices.",
    "Is it time to renegotiate terms?"
  ];

  return (
    <Card className="flex flex-col h-[600px] border-primary/20 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/40 via-primary to-primary/40"></div>
      <CardHeader className="border-b border-border/40 pb-4">
        <CardTitle className="flex items-center gap-2">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          AI Vendor Analyst
        </CardTitle>
        <CardDescription>Powered by Gemini</CardDescription>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'assistant' ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                  {msg.role === 'assistant' ? <Bot className="h-5 w-5" /> : <User className="h-5 w-5" />}
                </div>
                <div className={`px-4 py-3 rounded-2xl max-w-[80%] text-sm ${
                  msg.role === 'assistant'
                    ? 'bg-secondary/40 text-foreground rounded-tl-sm'
                    : 'bg-primary text-primary-foreground rounded-tr-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-secondary/40 rounded-tl-sm flex items-center gap-2">
                  <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-primary/80 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Suggested Queries */}
        <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide border-t border-border/40">
          {predefinedQueries.map((q, idx) => (
            <button
              key={idx}
              onClick={() => setInput(q)}
              className="whitespace-nowrap px-3 py-1.5 rounded-full bg-secondary text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </CardContent>

      <CardFooter className="p-4 border-t border-border/40 bg-background">
        <form
          className="flex w-full gap-2"
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        >
          <Input
            placeholder="Ask anything about this vendor..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !input.trim()} size="icon" className="bg-primary">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
