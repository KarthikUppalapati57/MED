import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Calculator, ChefHat, FlaskConical, Martini, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const phaseActions = [
  { label: 'Menu Items', path: '/Recipes/menu-items', icon: ChefHat },
  { label: 'Prepared Items', path: '/Recipes/prepared-items', icon: FlaskConical },
  { label: 'Bar Items', path: '/Recipes/bar-items', icon: Martini },
  { label: 'Recipe Setup', path: '/Recipes/setup', icon: Settings },
];

export default function MenuEngineering() {
  const navigate = useNavigate();
  const routerLocation = useLocation();

  const openPhaseArea = (path) => {
    navigate(`${path}${routerLocation.search}`);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
          <Calculator className="h-7 w-7 text-brand" /> Recipe Costing
        </h1>
        <p className="mt-1 text-lg text-muted-foreground">
          This production phase focuses on maintaining menu items, recipes, bar items, prepared items, and metric conversions.
        </p>
      </div>

      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle>Menu Engineering Is Not Enabled For This Phase</CardTitle>
          <CardDescription>
            Use the Recipes module to build a clean costing foundation before adding sales analysis later.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {phaseActions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.path}
                type="button"
                variant="outline"
                className="h-auto justify-start gap-3 p-4"
                onClick={() => openPhaseArea(action.path)}
              >
                <Icon className="h-4 w-4" />
                <span>{action.label}</span>
              </Button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
