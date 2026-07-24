import React from 'react';
import { Settings } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { buildMissingConversionSetupPath } from '@/modules/recipes/lib/missingConversionRoute';

export default function MissingConversionActions({ missingConversions = [], className = '', textClassName = 'text-xs' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const rows = (missingConversions || []).filter(Boolean);
  if (!rows.length) return null;

  return (
    <div className={`space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 ${className}`}>
      <p className={`${textClassName} text-destructive`}>
        Create conversion rules in Recipe Setup before relying on this cost.
      </p>
      <div className="space-y-1.5">
        {rows.slice(0, 4).map((missing, index) => {
          const from = missing.to_unit || 'cost unit';
          const to = missing.from_unit || 'recipe unit';
          const label = `${missing.product_name || 'Ingredient'}: ${from} to ${to}`;
          return (
            <Button
              key={`${missing.product_id || missing.product_name || 'missing'}-${from}-${to}-${index}`}
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => navigate(buildMissingConversionSetupPath(missing, {
                pathname: location.pathname,
                search: location.search,
              }))}
            >
              <Settings className="mr-2 h-3.5 w-3.5" />
              {label}
            </Button>
          );
        })}
      </div>
      {rows.length > 4 ? (
        <p className="text-xs text-muted-foreground">
          Showing 4 of {rows.length} missing conversion rules.
        </p>
      ) : null}
    </div>
  );
}
