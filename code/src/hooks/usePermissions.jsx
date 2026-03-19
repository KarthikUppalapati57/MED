import { useAuth } from '@/lib/AuthContext';

/**
 * Custom hook for role-based permission checks.
 * 
 * Roles hierarchy:
 *   ground_staff < manager < owner < admin
 * 
 * Permissions:
 *   ground_staff: Can only upload invoices and view products/invoices
 *   manager: Can edit (but not hard delete), approve invoices/payments
 *   owner: Full access (inherits admin + manager capabilities)
 *   admin: Full access including super delete and user management
 */
export function usePermissions() {
  const { role, userProfile } = useAuth();

  const roleLevel = {
    ground_staff: 0,
    manager: 1,
    owner: 2,
    admin: 3,
    platform_admin: 4,
  };

  const currentLevel = roleLevel[role] ?? 0;

  return {
    role,
    userProfile,

    // Basic permissions
    canView: true, 
    canUpload: true, 
    canCreate: currentLevel >= 1, 
    canEdit: currentLevel >= 1, 
    canApprove: currentLevel >= 1, 
    canDelete: currentLevel >= 2, 
    canSuperDelete: currentLevel >= 3, 
    canManageUsers: currentLevel >= 2, 
    canInviteUsers: currentLevel >= 1, 
    canManageHierarchy: currentLevel >= 4, // Platform Admin only

    // Module-specific permissions
    canEditInventory: currentLevel >= 1,
    canManageRecipes: currentLevel >= 1,
    canManageOrders: currentLevel >= 1,
    canProcessPayments: currentLevel >= 1,
    canManageVendors: currentLevel >= 1,

    // Utility
    isGroundStaff: role === 'ground_staff',
    isManager: role === 'manager',
    isOwner: role === 'owner',
    isAdmin: role === 'admin',
    isPlatformAdmin: role === 'platform_admin',
    isManagerOrAbove: currentLevel >= 1,
    isOwnerOrAbove: currentLevel >= 2,
    isPlatformAdminOrAbove: currentLevel >= 4,

    // Check against a specific minimum role
    hasMinRole: (minRole) => currentLevel >= (roleLevel[minRole] ?? 0),
  };
}
