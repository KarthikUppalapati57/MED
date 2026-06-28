import { useAuth } from '@/lib/AuthContext';
import React, { useMemo } from 'react';

/**
 * Custom hook for role-based capability checks.
 * 
 * Roles hierarchy:
 *   ground_staff < location_manager < branch_manager < org_owner < platform_admin
 * 
 * Capabilities:
 *   ground_staff:     View data, upload invoices
 *   location_manager: Edit, approve invoices/payments, manage local inventory
 *   branch_manager:   Manage multiple locations, access reports, manage staff
 *   org_owner:        Full org access, user management, org settings, accounting
 *   platform_admin:   Platform-wide management, all orgs, subscription/pricing
 */

const ROLE_LEVEL = {
  ground_staff:     0,
  location_manager: 1,
  manager:          2, // alias
  branch_manager:   2,
  org_owner:        3,
  owner:            3, // alias
  platform_admin:   4,
  admin:            4, // alias
};

export function usePermissions() {
  const { role, userProfile } = useAuth();

  const currentLevel = ROLE_LEVEL[role] ?? 0;

  return useMemo(() => ({
    role,
    userProfile,
    roleLevel: ROLE_LEVEL,

    // Basic capabilities
    canView: true, 
    canUpload: true, 
    canCreate: currentLevel >= 1,            // location_manager+
    canEdit: currentLevel >= 1,              // location_manager+
    canApprove: currentLevel >= 1,           // location_manager+
    canDelete: currentLevel >= 2,            // branch_manager+
    canSuperDelete: currentLevel >= 3,       // org_owner+
    canManageUsers: currentLevel >= 3,       // org_owner+
    canInviteUsers: currentLevel >= 2,       // branch_manager+
    canManageHierarchy: currentLevel >= 4,   // platform_admin only
    canManageSubscriptions: currentLevel >= 4, // platform_admin only
    canManageAccounting: currentLevel >= 3,  // org_owner+

    // Module-specific capabilities
    canEditInventory: currentLevel >= 1,     // location_manager+
    canManageRecipes: currentLevel >= 1,     // location_manager+
    canManageOrders: currentLevel >= 1,      // location_manager+
    canProcessPayments: currentLevel >= 2,   // branch_manager+
    canManageVendors: currentLevel >= 2,     // branch_manager+
    canViewReports: currentLevel >= 2,       // branch_manager+
    canManageLocations: currentLevel >= 2,   // branch_manager+
    canManageBrands: currentLevel >= 3,      // org_owner+

    // Role identity checks (new roles)
    isGroundStaff: role === 'ground_staff',
    isLocationManager: role === 'location_manager' || role === 'manager',
    isBranchManager: role === 'branch_manager' || role === 'manager',
    isOrgOwner: role === 'org_owner' || role === 'owner',
    isPlatformAdmin: role === 'platform_admin' || role === 'admin',

    // Level-based checks
    isLocationManagerOrAbove: currentLevel >= 1,
    isBranchManagerOrAbove: currentLevel >= 2,
    isOrgOwnerOrAbove: currentLevel >= 3,
    isPlatformAdminOrAbove: currentLevel >= 4,

    // Check against a specific minimum role
    hasMinRole: (minRole) => currentLevel >= (ROLE_LEVEL[minRole] ?? 0),
  }), [role, userProfile, currentLevel]);
}
