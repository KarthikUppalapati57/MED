import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthInfiniteQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { filterByContext } from '@/lib/contextUtils';
import { sendGeminiMessage } from '@/lib/geminiService';
import {
  Sparkles,
  AlertTriangle,
  Info,
  CheckCircle2,
  TrendingUp,
  Search,
  Check,
  Send,
  User,
  Bot
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const severityColors = {
  critical: 'bg-resend-red/10 text-resend-red border-resend-red/20',
  high: 'bg-resend-orange/10 text-resend-orange border-resend-orange/20',
  medium: 'bg-resend-yellow/10 text-resend-yellow border-resend-yellow/20',
  low: 'bg-resend-blue/10 text-resend-blue border-resend-blue/20',
};

const severityIcons = {
  critical: AlertTriangle,
  high: TrendingUp,
  medium: Info,
  low: CheckCircle2,
};

export default function AiInsights() {
  const { userProfile, organization, activeBrand, activeLocation } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('unresolved');
  const [activeTab, setActiveTab] = useState('insights');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', content: 'Hello! I am your Restops AI Assistant. Ask me anything about your restaurant\'s performance, inventory variances, or labor forecasts.' }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  const {
    data = {},
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading
  } = useAuthInfiniteQuery({
    queryKey: ['ai_insights'],
    queryFn: async ({ pageParam = 0 }) => {
      return await api.entities.AiInsight.list('-created_at', {
        page: pageParam,
        pageSize: 50
      });
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === 50 ? allPages.length : undefined;
    }
  });

  const insights = useMemo(() => data.pages ? data.pages.flat() : [], [data.pages]);

  const resolveMutation = useMutation({
    mutationFn: (id) => api.entities.AiInsight.update(id, { resolved: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai_insights'] });
      toast.success('Insight marked as resolved');
    },
    onError: (err) => {
      toast.error('Failed to resolve insight: ' + err.message);
    }
  });

  const filteredInsights = useMemo(() => {
    return insights.filter(insight => {
      const matchesSearch = insight.title?.toLowerCase().includes(search.toLowerCase()) || 
                            insight.description?.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filter === 'all' || 
                            (filter === 'unresolved' && !insight.resolved) ||
                            (filter === 'resolved' && insight.resolved);
      return matchesSearch && matchesFilter;
    });
  }, [insights, search, filter]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = { role: 'user', content: chatInput };
    const currentHistory = [...chatHistory, userMsg];
    setChatHistory(currentHistory);
    setChatInput('');
    setIsTyping(true);

    try {
      // Step 1: Gather raw context data (limit size to prevent massive token payloads)
      // We fetch all records for the org, then rely on filterByContext to strictly narrow to Brand/Location
      const results = await Promise.allSettled([
        api.entities.PosSalesData.list('-date', { limit: 100 }),
        api.entities.Invoice.list('-created_at', { limit: 50 }),
        api.entities.EmployeeShift.list('-created_at', { limit: 50 })
      ]);

      const rawSales = results[0].status === 'fulfilled' ? results[0].value : [];
      const rawInvoices = results[1].status === 'fulfilled' ? results[1].value : [];
      const rawLabor = results[2].status === 'fulfilled' ? results[2].value : [];

      // Step 2: Strictly filter based on current context
      const contextObj = { organization, brand: activeBrand, location: activeLocation };
      const scopeType = activeLocation ? 'Location' : activeBrand ? 'Brand' : 'Organization';
      const scopeName = activeLocation?.name || activeBrand?.name || organization?.name || 'Unknown';

      const metrics = {
        posSales: filterByContext(rawSales, contextObj),
        recentInvoices: filterByContext(rawInvoices, contextObj),
        laborShifts: filterByContext(rawLabor, contextObj),
      };

      const contextData = {
        scopeType,
        scopeName,
        metrics
      };

      // Step 3: Send to Gemini
      const aiResponse = await sendGeminiMessage(currentHistory, chatInput, contextData);
      
      setChatHistory(prev => [...prev, { role: 'assistant', content: aiResponse }]);
    } catch (err) {
      console.error(err);
      const errMessage = err.message || "Sorry, I encountered an error connecting to the AI engine.";
      setChatHistory(prev => [...prev, { role: 'assistant', content: errMessage }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-brand" />
            AI Insights Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Machine learning recommendations and anomaly detection
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="insights">Automated Insights</TabsTrigger>
          <TabsTrigger value="chat">Chat with Data <Badge variant="secondary" className="ml-2 bg-brand/10 text-brand text-[10px]">Beta</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="space-y-6">
          {/* Filters */}
      <Card className="glass-card shadow-sm border-0">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search insights..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background/50 border-border/50"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-full sm:w-48 bg-background/50 border-border/50">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unresolved">Unresolved Only</SelectItem>
              <SelectItem value="resolved">Resolved Only</SelectItem>
              <SelectItem value="all">All Insights</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Insights Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => (
            <Card key={i} className="h-48 animate-pulse bg-secondary/50 border-0" />
          ))}
        </div>
      ) : filteredInsights.length === 0 ? (
        <Card className="border-0 shadow-sm glass-card border border-border/50">
          <CardContent className="p-12 text-center text-muted-foreground">
            <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50 text-brand" />
            <h3 className="text-lg font-medium text-foreground mb-1">No insights found</h3>
            <p>Your AI agents are monitoring the system. Check back later!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredInsights.map(insight => {
            const severity = insight.severity || 'low';
            const Icon = severityIcons[severity] || Info;
            return (
              <Card key={insight.id} className="relative overflow-hidden group glass-card hover:shadow-glow-sm transition-all duration-300 border border-border/40 hover:border-brand/30">
                <div className={`absolute top-0 left-0 w-1 h-full ${
                  severity === 'critical' ? 'bg-resend-red' :
                  severity === 'high' ? 'bg-resend-orange' :
                  severity === 'medium' ? 'bg-resend-yellow' : 'bg-resend-blue'
                }`} />
                <CardContent className="p-5 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-3">
                    <Badge variant="outline" className={`capitalize ${severityColors[severity]}`}>
                      <Icon className="w-3 h-3 mr-1" />
                      {severity}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-medium bg-secondary/50 px-2 py-1 rounded-full">
                      {format(new Date(insight.created_at), 'MMM d, h:mm a')}
                    </span>
                  </div>
                  
                  <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-brand transition-colors">
                    {insight.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6 flex-grow leading-relaxed">
                    {insight.description}
                  </p>

                  <div className="flex items-center justify-between pt-4 border-t border-border/40 mt-auto">
                    <span className="text-xs font-medium text-muted-foreground bg-secondary/50 px-2 py-1 rounded">
                      Type: {insight.insight_type}
                    </span>
                    {!insight.resolved ? (
                      <div className="flex gap-2">
                        {insight.metadata?.action && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              const actionType = insight.metadata.action.type;
                              if (actionType === 'adjust_recipe_price') {
                                navigate(`/MenuEngineering?tab=recipes`);
                              } else if (actionType === 'create_order') {
                                navigate(`/AutoOrdering?tab=place-order`);
                              } else if (actionType === 'investigate_variance') {
                                navigate(`/Performance?tab=usage`);
                              } else {
                                toast.info(`Action ${actionType} triggered`);
                              }
                            }}
                          >
                            {insight.metadata.action.label}
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => resolveMutation.mutate(insight.id)}
                          className="text-resend-green hover:text-resend-green hover:bg-resend-green/10 -mr-2"
                        >
                          <Check className="w-4 h-4 mr-1.5" />
                          Resolve
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-resend-green flex items-center">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Resolved
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
          {hasNextPage && !search && (
            <div className="flex justify-center mt-8">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load More Insights'
                )}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="chat" className="h-[600px] flex flex-col">
          <Card className="flex-1 flex flex-col overflow-hidden border-border/50 shadow-sm glass-card">
            <CardHeader className="border-b border-border/40 pb-4 bg-secondary/20">
              <CardTitle className="text-lg flex items-center gap-2">
                <Bot className="h-5 w-5 text-brand" />
                Restops Copilot
              </CardTitle>
              <p className="text-xs text-muted-foreground">Ask questions about your sales, inventory variances, or labor forecasts in plain English.</p>
            </CardHeader>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4 pb-4">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="h-8 w-8 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                        <Bot className="h-4 w-4 text-brand" />
                      </div>
                    )}
                    <div className={`p-3 rounded-xl text-sm max-w-[80%] ${
                      msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-secondary rounded-tl-sm'
                    }`}>
                      {msg.content}
                    </div>
                    {msg.role === 'user' && (
                      <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                    )}
                  </div>
                ))}
                {isTyping && (
                  <div className="flex gap-3 justify-start">
                    <div className="h-8 w-8 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-brand" />
                    </div>
                    <div className="p-3 rounded-xl bg-secondary rounded-tl-sm text-sm text-muted-foreground flex items-center gap-1">
                      <span className="animate-bounce delay-75">.</span>
                      <span className="animate-bounce delay-150">.</span>
                      <span className="animate-bounce delay-300">.</span>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="p-4 bg-background border-t border-border/40">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input 
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="e.g. What is my food cost variance today?" 
                  className="flex-1 bg-secondary/50"
                />
                <Button type="submit" disabled={!chatInput.trim() || isTyping}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
