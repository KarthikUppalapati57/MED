import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ApiKeysTab from '@/components/developers/ApiKeysTab';
import WebhooksTab from '@/components/developers/WebhooksTab';
import WebhookLogsTab from '@/components/developers/WebhookLogsTab';
import DataExportTab from '@/components/developers/DataExportTab';
import { Code, Webhook, Activity, Download } from 'lucide-react';

export default function DeveloperPortal() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Developer Portal</h1>
        <p className="text-muted-foreground mt-2">
          Manage API keys, configure webhooks, and export your data.
        </p>
      </div>

      <Tabs defaultValue="api-keys" className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="api-keys" className="flex items-center gap-2">
            <Code className="h-4 w-4" /> API Keys
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="flex items-center gap-2">
            <Webhook className="h-4 w-4" /> Webhooks
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Activity className="h-4 w-4" /> Logs
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-2">
            <Download className="h-4 w-4" /> Data Export
          </TabsTrigger>
        </TabsList>

        <div className="mt-6 border rounded-lg p-6 bg-card">
          <TabsContent value="api-keys">
            <ApiKeysTab />
          </TabsContent>
          
          <TabsContent value="webhooks">
            <WebhooksTab />
          </TabsContent>
          
          <TabsContent value="logs">
            <WebhookLogsTab />
          </TabsContent>

          <TabsContent value="export">
            <DataExportTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
