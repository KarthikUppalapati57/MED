import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthInfiniteQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import {
  Sparkles,
  AlertTriangle,
  Info,
  CheckCircle2,
  TrendingUp,
  Search,
  Check,
  Bot,
  Loader2,
  Send,
  User
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
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
  const { organization, brand, location } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('unresolved');
  const [activeTab, setActiveTab] = useState('insights');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    {
      role: 'assistant',
      content: 'I can help analyze the restaurant data in your current context. Switch organization, brand, or location to change what I can see.',
    },
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);

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

  const scopeLabel = location?.name || brand?.name || organization?.name || 'Current context';

  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    const message = chatInput.trim();
    if (!message || isChatLoading) return;
    if (!organization?.id) {
      toast.error('Select an organization before using AI Insights Copilot');
      return;
    }

    const nextHistory = [...chatHistory, { role: 'user', content: message }];
    setChatHistory(nextHistory);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const historyForFunction = nextHistory
        .filter((item) => item.role === 'user' || item.role === 'assistant')
        .slice(-8);

      const { data, error } = await supabase.functions.invoke('ai-insights-chat', {
        body: {
          message,
          history: historyForFunction,
          context: {
            organizationId: organization.id,
            brandId: brand?.id || null,
            locationId: location?.id || null,
          },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: data?.reply || 'I could not generate an answer from the available context.',
      }]);
    } catch (err) {
      console.error('AI Insights Copilot error:', err);
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: err.message || 'AI Insights Copilot could not answer right now.',
      }]);
    } finally {
      setIsChatLoading(false);
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
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="copilot">Copilot</TabsTrigger>
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

        <TabsContent value="copilot">
          <Card className="glass-card border border-border/50 shadow-sm">
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                    <Bot className="h-5 w-5 text-brand" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground leading-tight">AI Insights Copilot</p>
                    <p className="text-xs text-muted-foreground truncate">Scope: {scopeLabel}</p>
                  </div>
                </div>
                <Badge variant="secondary" className="bg-brand/10 text-brand border-0">Scoped</Badge>
              </div>

              <ScrollArea className="h-[520px] p-4">
                <div className="space-y-4 pb-4">
                  {chatHistory.map((msg, index) => (
                    <div key={`${msg.role}-${index}`} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'assistant' && (
                        <div className="h-8 w-8 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                          <Bot className="h-4 w-4 text-brand" />
                        </div>
                      )}
                      <div className={`max-w-[82%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-tr-sm'
                          : 'bg-secondary text-secondary-foreground rounded-tl-sm'
                      }`}>
                        {msg.content}
                      </div>
                      {msg.role === 'user' && (
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                      )}
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex gap-3 justify-start">
                      <div className="h-8 w-8 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                        <Bot className="h-4 w-4 text-brand" />
                      </div>
                      <div className="bg-secondary text-secondary-foreground rounded-xl rounded-tl-sm px-3 py-2 text-sm flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-brand" />
                        Reviewing scoped data
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <form onSubmit={handleSendChatMessage} className="flex gap-2 border-t border-border/50 p-4">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about invoices, sales, prep, inventory, vendors, or labor..."
                  className="flex-1 bg-background/60"
                />
                <Button type="submit" size="icon" disabled={!chatInput.trim() || isChatLoading}>
                  {isChatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
