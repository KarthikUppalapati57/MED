import React from 'react';
import { ShieldX, Lock, ArrowUpCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

/**
 * AccessDenied — Premium denial page shown when a user lacks permission.
 * 
 * Two modes:
 *   reason="role"   → User's role is too low for this page
 *   reason="module" → The org's plan doesn't include this module
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
            ? 'bg-gradient-to-br from-amber-100 to-orange-100' 
            : 'bg-gradient-to-br from-red-100 to-rose-100'
          }
        `}>
          {isModuleDenied 
            ? <Lock className="w-10 h-10 text-amber-600" />
            : <ShieldX className="w-10 h-10 text-red-500" />
          }
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          {isModuleDenied ? 'Module Not Available' : 'Access Restricted'}
        </h2>

        {/* Description */}
        <p className="text-slate-500 mb-6 leading-relaxed">
          {isModuleDenied ? (
            <>
              The <span className="font-semibold text-slate-700">{moduleName}</span> module 
              is not included in your organization's current plan. 
              Contact your organization owner to upgrade your subscription.
            </>
          ) : (
            <>
              You need <span className="font-semibold text-slate-700 capitalize">
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
              className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0"
              onClick={() => navigate('/OrgManagement')}
            >
              <ArrowUpCircle className="w-4 h-4" />
              View Plans
            </Button>
          )}
        </div>

        {/* Decorative border */}
        <div className="mt-8 pt-6 border-t border-slate-100">
          <p className="text-xs text-slate-400">
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
