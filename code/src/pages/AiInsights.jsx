import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import {
  Sparkles,
  AlertTriangle,
  Info,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Search,
  Check
} from 'lucide-react';
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
  const { userProfile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('unresolved');

  const { data: insights = [], isLoading } = useQuery({
    queryKey: ['ai_insights'],
    queryFn: () => api.entities.AiInsight.list('-created_at'),
  });

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
    </div>
  );
}
