import React from 'react';
import { ShieldX, Lock, ArrowUpCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

/**
 * AccessDenied â€” Premium denial page shown when a user lacks permission.
 * 
 * Two modes:
 *   reason="role"   â†’ User's role is too low for this page
 *   reason="module" â†’ The org's plan doesn't include this module
 */
export default function AccessDenied({ reason = 'role', requiredRole, moduleName }) {
  const navigate = useNavigate();

  const isModuleDenied = reason === 'module';

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className={`
          mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-6
          ${isModuleDenied 
            ? 'bg-gradient-to-br from-resend-yellow/10 to-resend-orange/10' 
            : 'bg-gradient-to-br from-resend-red/10 to-resend-red/10'
          }
        `}>
          {isModuleDenied 
            ? <Lock className="w-10 h-10 text-resend-yellow" />
            : <ShieldX className="w-10 h-10 text-resend-red" />
          }
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-foreground mb-2">
          {isModuleDenied ? 'Module Not Available' : 'Access Restricted'}
        </h2>

        {/* Description */}
        <p className="text-muted-foreground mb-6 leading-relaxed">
          {isModuleDenied ? (
            <>
              The <span className="font-semibold text-foreground">{moduleName}</span> module 
              is not included in your organization's current plan. 
              Contact your organization owner to upgrade your subscription.
            </>
          ) : (
            <>
              You need <span className="font-semibold text-foreground capitalize">
                {requiredRole?.replace('_', ' ')}
              </span> access or higher to view this page. 
              Contact your administrator if you believe this is an error.
            </>
          )}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => navigate('/Dashboard')}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
          {isModuleDenied && (
            <Button
              className="gap-2 bg-gradient-to-r from-resend-yellow to-resend-orange hover:from-resend-yellow hover:to-resend-orange text-white border-0"
              onClick={() => navigate('/OrgManagement')}
            >
              <ArrowUpCircle className="w-4 h-4" />
              View Plans
            </Button>
          )}
        </div>

        {/* Decorative border */}
        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {isModuleDenied 
              ? 'Available modules are determined by your organization\'s subscription plan.'
              : 'Access levels are managed by your organization administrator.'
            }
          </p>
        </div>
      </div>
    </div>
  );
}

