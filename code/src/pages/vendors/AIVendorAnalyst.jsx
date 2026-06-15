import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Send, Bot, User } from 'lucide-react';

export default function AIVendorAnalyst({ vendorId }) {
  const { organization } = useAuth();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hello! I'm your AI Vendor Analyst. I can help you analyze pricing trends, find missing invoices, or suggest negotiation strategies. What would you like to know?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // In a real implementation, this would call the new API endpoint you are setting up.
      // e.g. await api.post('/ai/vendor-analyst', { vendorId, query: userMessage.content })
      
      // Simulating API delay and mock response since we are stubbing the Dockling/Vertex layer.
      setTimeout(() => {
        const mockResponses = [
          "Based on the last 3 invoices parsed via Dockling, prices on Atlantic Salmon have increased by 8.4%. You may want to renegotiate or look for an alternative supplier.",
          "I've cross-referenced the order guide with receiving logs. Delivery consistency is at 92%, but there was a significant short-shipment last Tuesday.",
          "There are currently 2 invoices marked as unpaid for this vendor totaling $1,450.20.",
          "I'm analyzing the mapped items. 5 items on your order guide haven't been ordered in 6 months. I recommend removing them to clean up the guide."
        ];
        const randomResponse = mockResponses[Math.floor(Math.random() * mockResponses.length)];
        
        setMessages(prev => [...prev, { role: 'assistant', content: randomResponse }]);
        setIsLoading(false);
      }, 1500);

    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I encountered an error analyzing that request. Please try again." }]);
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
        <CardDescription>Powered by Vertex AI & Dockling Document Intelligence</CardDescription>
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
