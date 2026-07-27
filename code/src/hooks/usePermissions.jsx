import { useAuth } from '@/lib/AuthContext';
import { useMemo } from 'react';

/**
 * Custom hook for role-based capability checks.
 *
 * Roles hierarchy:
 *   ground_staff < location_manager < branch_manager < org_manager < tenant_super_admin < platform_admin
 */

const ROLE_LEVEL = {
  ground_staff:        0,
  location_manager:    1,
  manager:             2, // legacy alias
  branch_manager:      2,
  owner:               3, // legacy alias
  org_manager:         3,
  tenant_super_admin:  4,
  admin:               5, // legacy alias
  platform_admin:      5,
};

function normalizeRole(role) {
  if (role === 'owner') return 'org_manager';
  if (role === 'manager') return 'branch_manager';
  if (role === 'admin') return 'platform_admin';
  // brand_manager is a fossil string that never matched any RLS policy
  // (the real brand-tier role is branch_manager) -- alias it so any
  // pre-existing row with this value still resolves correctly.
  if (role === 'brand_manager') return 'branch_manager';
  return role || 'ground_staff';
}

export function usePermissions() {
  const { role, userProfile } = useAuth();
  const normalizedRole = normalizeRole(role);
  const currentLevel = ROLE_LEVEL[normalizedRole] ?? 0;

  return useMemo(() => ({
    role: normalizedRole,
    rawRole: role,
    userProfile,
    roleLevel: ROLE_LEVEL,

    canView: true,
    canUpload: true,
    canCreate: currentLevel >= 1,
    canEdit: currentLevel >= 1,
    canApprove: currentLevel >= 1,
    canDelete: currentLevel >= 2,
    canSuperDelete: currentLevel >= 3,
    canManageUsers: currentLevel >= 3,
    canInviteUsers: currentLevel >= 2,
    canManageHierarchy: currentLevel >= 4,
    canManageSubscriptions: currentLevel >= 4,
    canManageAccounting: currentLevel >= 3,

    canEditInventory: currentLevel >= 1,
    canManageRecipes: currentLevel >= 1,
    canManageOrders: currentLevel >= 1,
    canProcessPayments: currentLevel >= 2,
    canManageVendors: currentLevel >= 2,
    canViewReports: currentLevel >= 2,
    canManageLocations: currentLevel >= 2,
    canManageBrands: currentLevel >= 3,

    isGroundStaff: normalizedRole === 'ground_staff',
    isLocationManager: normalizedRole === 'location_manager',
    isBranchManager: normalizedRole === 'branch_manager',
    isOrgManager: normalizedRole === 'org_manager',
    isTenantSuperAdmin: normalizedRole === 'tenant_super_admin',
    isPlatformAdmin: normalizedRole === 'platform_admin',

    isLocationManagerOrAbove: currentLevel >= 1,
    isBrandManagerOrAbove: currentLevel >= 2,
    isBranchManagerOrAbove: currentLevel >= 2,
    isOrgManagerOrAbove: currentLevel >= 3,
    isTenantSuperAdminOrAbove: currentLevel >= 4,
    isPlatformAdminOrAbove: currentLevel >= 5,

    hasMinRole: (minRole) => currentLevel >= (ROLE_LEVEL[normalizeRole(minRole)] ?? 0),
  }), [role, userProfile, normalizedRole, currentLevel]);
}

export { normalizeRole, ROLE_LEVEL };