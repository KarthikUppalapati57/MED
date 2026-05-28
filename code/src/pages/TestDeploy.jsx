import React from 'react';
import { Card } from '@/components/ui/card';

export default function TestDeploy() {
  return (
    <div className="p-8 space-y-4">
      <h1 className="text-3xl font-bold text-foreground">Test Deployment Page</h1>
      <Card className="p-6 border border-border/50 bg-card">
        <p className="text-muted-foreground">
          This is a test page created to verify that the GitHub integration automatically triggers a build and deployment on Vercel.
        </p>
        <p className="text-sm mt-4 text-brand">If you can see this page on the live Vercel URL, the CI/CD pipeline is working perfectly!</p>
      </Card>
    </div>
  );
}
