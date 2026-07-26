import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { getModuleForPage, isPageInEnabledModules, isUngatedAuthPage } from '@/lib/moduleConfig';
import AccessDenied from '@/components/AccessDenied';

/**
 * ProtectedModule Route-level guard component.
 *
 * Wraps every page in App.jsx to enforce:
 *   1. Role check: user.role >= module.minRole
 *   2. Module check: page's module is in org.enabled_modules
 *   3. Location check: module.requiresLocation modules need one selected
 *
 * Platform admins bypass ALL checks.
 *
 * If any check fails, renders <AccessDenied /> with the appropriate reason.
 *
 * Usage:
 *   <ProtectedModule pageName="Recipes">
 *     <RecipesPage />
 *   </ProtectedModule>
 */
export default function ProtectedModule({ pageName, children }) {
  const { organization, userProfile, location } = useAuth();
  const { hasMinRole, isPlatformAdmin } = usePermissions();

  // Look up which module this page belongs to
  const moduleInfo = getModuleForPage(pageName);

  // Platform Admins are STRICTLY restricted to only Platform Admin modules and Dashboard
  if (isPlatformAdmin) {
    const isDashboard = pageName === 'Dashboard';
    const isFeedback = moduleInfo?.key === 'feedback';
    if (!moduleInfo) {
      return isUngatedAuthPage(pageName) ? <>{children}</> : <AccessDenied reason="module" moduleName="Unmapped module" />;
    }
    if (!isDashboard && !isFeedback && moduleInfo.minRole !== 'platform_admin') {
      return <AccessDenied reason="role" requiredRole="tenant_user" />;
    }
    return <>{children}</>;
  }

  // Only explicitly allow setup pages outside module definitions. Everything else is fail-closed.
  if (!moduleInfo) {
    return isUngatedAuthPage(pageName) ? <>{children}</> : <AccessDenied reason="module" moduleName="Unmapped module" />;
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

  // Check 3: Some modules have no meaningful multi-location view (e.g. Kitchen
  // Displays). `location` is already role-aware -- fixed from profile for
  // location_manager/ground_staff, so this only ever fires for switcher roles
  // who haven't picked one yet.
  if (moduleInfo.requiresLocation && !location?.id) {
    return <AccessDenied reason="location" />;
  }

 // All checks passed render the page
  return <>{children}</>;
}
