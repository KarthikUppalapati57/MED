import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { getModuleForPage, isPageInEnabledModules } from '@/lib/moduleConfig';
import AccessDenied from '@/components/AccessDenied';

/**
 * ProtectedModule Route-level guard component.
 * 
 * Wraps every page in App.jsx to enforce:
 *   1. Role check: user.role >= module.minRole
 *   2. Module check: page's module is in org.enabled_modules
 * 
 * Platform admins bypass ALL checks.
 * 
 * If either check fails, renders <AccessDenied /> with the appropriate reason.
 * 
 * Usage:
 *   <ProtectedModule pageName="Recipes">
 *     <RecipesPage />
 *   </ProtectedModule>
 */
export default function ProtectedModule({ pageName, children }) {
  const { organization, userProfile } = useAuth();
  const { hasMinRole, isPlatformAdmin } = usePermissions();

  // Look up which module this page belongs to
  const moduleInfo = getModuleForPage(pageName);

  // Platform Admins are STRICTLY restricted to only Platform Admin modules and Dashboard
  if (isPlatformAdmin) {
    const isDashboard = pageName === 'Dashboard';
    if (!isDashboard && moduleInfo && moduleInfo.minRole !== 'platform_admin') {
      return <AccessDenied reason="role" requiredRole="tenant_user" />;
    }
    return <>{children}</>;
  }

  // If the page isn't in any module definition, allow it through
  // (handles pages like OnboardingPage, PaymentVerification that aren't module-gated)
  if (!moduleInfo) return <>{children}</>;

  const userPermissions = userProfile?.page_permissions || userProfile?.permissions || {};
  const explicitPerm = userPermissions[pageName];

  // If explicitly denied, block immediately
  if (explicitPerm === 'none') {
    return <AccessDenied reason="role" requiredRole={moduleInfo.minRole || 'explicit_grant'} />;
  }

  // If explicitly granted, bypass role and module checks
  if (explicitPerm === 'read' || explicitPerm === 'full') {
    return <>{children}</>;
  }

  // Check 1: Role requirement
  if (moduleInfo.minRole && !hasMinRole(moduleInfo.minRole)) {
    return <AccessDenied reason="role" requiredRole={moduleInfo.minRole} />;
  }

  // Check 2: Module enabled for the user's organization (FAIL-CLOSED)
  // Core modules (dashboard, admin) always pass. Operational modules require
  // explicit inclusion in org.enabled_modules. If enabled_modules is empty/null,
 // only core modules are accessible this is secure-by-default.
  const enabledModules = organization?.enabled_modules;
  const userRole = userProfile?.role;
  if (!isPageInEnabledModules(pageName, enabledModules, userRole)) {
    return <AccessDenied reason="module" moduleName={moduleInfo.label} />;
  }

 // All checks passed render the page
  return <>{children}</>;
}
