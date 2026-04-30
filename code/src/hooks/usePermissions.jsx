import { useAuth } from '@/lib/AuthContext';

/**
 * Custom hook for role-based permission checks.
 * 
 * Roles hierarchy (new — per MG.drawio blueprint):
 *   ground_staff < location_manager < branch_manager < org_owner < platform_admin
 * 
 * Backward-compatible aliases (old → new):
 *   manager      → location_manager  (level 1)
 *   owner        → org_owner         (level 3)
 *   admin        → org_owner         (level 3)
 * 
 * Permissions:
 *   ground_staff:     View data, upload invoices
 *   location_manager: Edit, approve invoices/payments, manage local inventory
 *   branch_manager:   Manage multiple locations, access reports, manage staff
 *   org_owner:        Full org access, user management, org settings, accounting
 *   platform_admin:   Platform-wide management, all orgs, subscription/pricing
 */
export function usePermissions() {
  const { role, userProfile } = useAuth();

  // New hierarchy with backward-compatible aliases
  const roleLevel = {
    ground_staff:     0,
    location_manager: 1,
    manager:          1,  // backward compat → location_manager
    branch_manager:   2,
    org_owner:        3,
    owner:            3,  // backward compat → org_owner
    admin:            3,  // backward compat → org_owner
    platform_admin:   4,
  };

  const currentLevel = roleLevel[role] ?? 0;

  return {
    role,
    userProfile,

    // Basic permissions
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

    // Module-specific permissions
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
    isBranchManager: role === 'branch_manager',
    isOrgOwner: role === 'org_owner' || role === 'owner' || role === 'admin',
    isPlatformAdmin: role === 'platform_admin',

    // Backward-compatible aliases
    isManager: role === 'location_manager' || role === 'manager',
    isOwner: role === 'org_owner' || role === 'owner' || role === 'admin',
    isAdmin: role === 'org_owner' || role === 'owner' || role === 'admin',

    // Level-based checks
    isLocationManagerOrAbove: currentLevel >= 1,
    isBranchManagerOrAbove: currentLevel >= 2,
    isOrgOwnerOrAbove: currentLevel >= 3,
    isPlatformAdminOrAbove: currentLevel >= 4,

    // Backward-compatible aliases
    isManagerOrAbove: currentLevel >= 1,
    isOwnerOrAbove: currentLevel >= 3,

    // Check against a specific minimum role
    hasMinRole: (minRole) => currentLevel >= (roleLevel[minRole] ?? 0),
  };
}
