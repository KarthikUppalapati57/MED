import React from 'react';
import { ShieldX, Lock, MapPin, ArrowUpCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

/**
 * AccessDenied � Premium denial page shown when a user lacks permission.
 *
 * Three modes:
 *   reason="role"     -> User's role is too low for this page
 *   reason="module"   -> The org's plan doesn't include this module
 *   reason="location" -> Page needs one specific location, none selected yet
 */
export default function AccessDenied({ reason = 'role', requiredRole, moduleName }) {
  const navigate = useNavigate();

  const isModuleDenied = reason === 'module';
  const isLocationDenied = reason === 'location';

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className={`
          mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-6
          ${isLocationDenied
            ? 'bg-gradient-to-br from-resend-blue/10 to-resend-blue/10'
            : isModuleDenied
            ? 'bg-gradient-to-br from-resend-yellow/10 to-resend-orange/10'
            : 'bg-gradient-to-br from-resend-red/10 to-resend-red/10'
          }
        `}>
          {isLocationDenied
            ? <MapPin className="w-10 h-10 text-resend-blue" />
            : isModuleDenied
            ? <Lock className="w-10 h-10 text-resend-yellow" />
            : <ShieldX className="w-10 h-10 text-resend-red" />
          }
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-foreground mb-2">
          {isLocationDenied ? 'Select a Location' : isModuleDenied ? 'Module Not Available' : 'Access Restricted'}
        </h2>

        {/* Description */}
        <p className="text-muted-foreground mb-6 leading-relaxed">
          {isLocationDenied ? (
            <>
              This page shows one location at a time, and none is selected yet.
              Use the location switcher in the header to choose one, then come back.
            </>
          ) : isModuleDenied ? (
            <>
              The <span className="font-semibold text-foreground">{moduleName}</span> module
              is not included in your organization's current plan.
              Contact your organization manager to upgrade your subscription.
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
            {isLocationDenied
              ? 'The location switcher is in the header, next to your organization and brand.'
              : isModuleDenied
              ? 'Available modules are determined by your organization\'s subscription plan.'
              : 'Access levels are managed by your organization administrator.'
            }
          </p>
        </div>
      </div>
    </div>
  );
}
