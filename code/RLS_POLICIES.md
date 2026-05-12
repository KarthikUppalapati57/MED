# MECURSOR — RLS Policies per Table

---

## 1. access_requests
**Purpose:** Stores requests from new users wanting access to the platform.
**Policies:**
- `Anon_Insert_Access_Requests` → INSERT — Anyone can submit a request
- `Admin_Read_Access_Requests` → SELECT — Platform admin can read
- `Admin_Manage_Access_Requests` → UPDATE — Platform admin can update

---

## 2. archived_brands
**Purpose:** Stores soft-deleted brand records for audit trail and recovery.
**Policies:**
- `Platform_Admin_Only_Archived_Brands` → ALL — Platform admin only

---

## 3. archived_invitations
**Purpose:** Stores soft-deleted invitation records for audit trail and recovery.
**Policies:**
- `Platform_Admin_Only_Archived_Invitations` → ALL — Platform admin only

---

## 4. archived_locations
**Purpose:** Stores soft-deleted location records for audit trail and recovery.
**Policies:**
- `Platform_Admin_Only_Archived_Locations` → ALL — Platform admin only

---

## 5. archived_organizations
**Purpose:** Stores soft-deleted organization records for audit trail and recovery.
**Policies:**
- `Platform_Admin_Only_Archived_Organizations` → ALL — Platform admin only

---

## 6. archived_profiles
**Purpose:** Stores soft-deleted user profile records for audit trail and recovery.
**Policies:**
- `Platform_Admin_Only_Archived_Profiles` → ALL — Platform admin only

---

## 7. audit_logs
**Purpose:** Tracks all user actions across the system for compliance and accountability.
**Policies:**
- `Audit_Log_Isolation` → SELECT — Own org OR platform admin can read

---

## 8. auto_orders
**Purpose:** Manages automated purchase orders generated from inventory thresholds.
**Policies:**
- `Platform_Admin_Full` → ALL — Platform admin full access
- `Tenant_Isolation_auto_orders` → ALL — Own org members full access

---

## 9. brands
**Purpose:** Stores brand entities that belong to an organization (e.g., restaurant brand names).
**Policies:**
- `Platform_Admin_Full` → ALL — Platform admin full access
- `Tenant_Isolation_brands` → ALL — Own org members full access

---

## 10. contact_requests
**Purpose:** Stores contact form submissions from the public website.
**Policies:**
- `Anon_Insert_Contact_Requests` → INSERT — Anyone can submit
- `Admin_Read_Contact_Requests` → SELECT — Platform admin can read
- `Admin_Manage_Contact_Requests` → UPDATE — Platform admin can update

---

## 11. demo_requests
**Purpose:** Stores demo scheduling requests from prospective customers.
**Policies:**
- `Anon_Insert_Demo_Requests` → INSERT — Anyone can submit
- `Admin_Read_Demo_Requests` → SELECT — Platform admin can read
- `Admin_Manage_Demo_Requests` → UPDATE — Platform admin can update

---

## 12. dim_date
**Purpose:** Data warehouse date dimension table used for analytics and reporting joins.
**Policies:**
- `Authenticated_Read_Dim_Date` → SELECT — Any signed-in user can read
- `Platform_Admin_Full_Dim_Date` → ALL — Platform admin full access

---

## 13. dim_product
**Purpose:** Data warehouse product dimension table for analytics (SCD Type 2).
**Policies:**
- `Tenant_Read_Dim_Product` → SELECT — Own org members can read
- `Platform_Admin_Full_Dim_Product` → ALL — Platform admin full access

---

## 14. dim_user
**Purpose:** Data warehouse user dimension table for analytics (SCD Type 2).
**Policies:**
- `Tenant_Read_Dim_User` → SELECT — Own org members can read
- `Platform_Admin_Full_Dim_User` → ALL — Platform admin full access

---

## 15. dim_vendor
**Purpose:** Data warehouse vendor dimension table for analytics (SCD Type 2).
**Policies:**
- `Tenant_Read_Dim_Vendor` → SELECT — Own org members can read
- `Platform_Admin_Full_Dim_Vendor` → ALL — Platform admin full access

---

## 16. fact_inventory
**Purpose:** Data warehouse fact table tracking inventory snapshots over time.
**Policies:**
- `Tenant_Read_Fact_Inventory` → SELECT — Own org members can read
- `Platform_Admin_Full_Fact_Inventory` → ALL — Platform admin full access

---

## 17. fact_invoices
**Purpose:** Data warehouse fact table storing invoice metrics for financial reporting.
**Policies:**
- `Tenant_Read_Fact_Invoices` → SELECT — Own org members can read
- `Platform_Admin_Full_Fact_Invoices` → ALL — Platform admin full access

---

## 18. fact_orders
**Purpose:** Data warehouse fact table tracking purchase order metrics.
**Policies:**
- `Tenant_Read_Fact_Orders` → SELECT — Own org members can read
- `Platform_Admin_Full_Fact_Orders` → ALL — Platform admin full access

---

## 19. fact_payments
**Purpose:** Data warehouse fact table tracking payment transactions for reporting.
**Policies:**
- `Tenant_Read_Fact_Payments` → SELECT — Own org members can read
- `Platform_Admin_Full_Fact_Payments` → ALL — Platform admin full access

---

## 20. fact_wastage
**Purpose:** Data warehouse fact table tracking food waste metrics for reporting.
**Policies:**
- `Tenant_Read_Fact_Wastage` → SELECT — Own org members can read
- `Platform_Admin_Full_Fact_Wastage` → ALL — Platform admin full access

---

## 21. inventory
**Purpose:** Tracks current inventory levels, quantities, values, and par levels per product per location.
**Policies:**
- `Platform_Admin_Full` → ALL — Platform admin full access
- `Tenant_Isolation_inventory` → ALL — Own org members full access

---

## 22. invitations
**Purpose:** Manages pending invites for new users before they join an organization, ensuring they are assigned the correct role and location.
**Policies:**
- `invitations_platform_admin_full` → ALL — Platform admins have full access for support
- `invitations_org_owner_select` → SELECT — Org owners can view all pending invitations in their organization
- `invitations_branch_manager_select` → SELECT — Branch managers can view pending invitations only for their assigned brand(s)
- `invitations_location_manager_select` → SELECT — Location managers can view pending invitations only for their assigned location(s)
- `invitations_create_with_role_check` → INSERT — Only allows users to invite roles *below* their current level
- `invitations_cancel_own` → DELETE — The original creator of an invite (or an org owner) can cancel/delete the invitation
- `invitations_org_owner_update` → UPDATE — Only org owners can modify the details of an existing invitation

---

## 23. invoices
**Purpose:** Stores vendor invoices with line items, totals, payment status, and AI extraction results.
**Policies:**
- `Platform_Admin_Full` → ALL — Platform admin full access
- `Tenant_Isolation_invoices` → ALL — Own org members full access

---

## 24. locations
**Purpose:** Stores physical locations (restaurants/sites) belonging to a brand within an organization.
**Policies:**
- `Platform_Admin_Full` → ALL — Platform admin full access
- `Tenant_Isolation_locations` → ALL — Own org members full access

---

## 25. notifications
**Purpose:** Stores in-app notifications for users (invoice alerts, order updates, system messages).
**Policies:**
- `Platform_Admin_Full` → ALL — Platform admin full access
- `Tenant_Isolation_notifications` → ALL — Own org members full access

---

## 26. organizations
**Purpose:** Top-level tenant entity storing org name, subscription plan, Stripe IDs, and owner reference.
**Policies:**
- `organizations_platform_admin_full` → ALL — Platform admins have full access to manage SaaS billing and settings
- `organizations_member_select` → SELECT — Anyone belonging to an organization can read their organization's basic details
- `organizations_owner_update` → UPDATE — Only org owners can update their organization's settings

---

## 27. payments
**Purpose:** Records payments made against invoices, tracking method, status, and bank references.
**Policies:**
- `Platform_Admin_Full` → ALL — Platform admin full access
- `Tenant_Isolation_payments` → ALL — Own org members full access

---

## 28. plans
**Purpose:** Defines available subscription plans with pricing and feature sets.
**Policies:**
- `Public_Read_Plans` → SELECT — Anyone can read plans (for pricing page)
- `Platform_Admin_Full_Plans` → ALL — Platform admin full access

---

## 29. products
**Purpose:** Master product catalog with pricing, categories, vendor info, and inventory settings.
**Policies:**
- `Platform_Admin_Full` → ALL — Platform admin full access
- `Tenant_Isolation_products` → ALL — Own org members full access

---

## 30. profiles
**Purpose:** Stores user profiles, roles, and access levels (ground staff up to org owners) for everyone on the platform.
**Policies:**
- `profiles_platform_admin_full` → ALL — Platform admins have full access for support
- `profiles_self_select` → SELECT — Users can always read their own profile
- `profiles_self_update` → UPDATE — Users can update their own profile information
- `profiles_org_owner_select` → SELECT — Org owners can view all profiles in their entire organization
- `profiles_org_owner_update` → UPDATE — Org owners can update any profile within their organization
- `profiles_branch_manager_select` → SELECT — Branch managers can view profiles only within their assigned brand(s)
- `profiles_branch_manager_update` → UPDATE — Branch managers can update profiles of location managers and ground staff in their brand(s)
- `profiles_location_manager_select` → SELECT — Location managers can view profiles only at their assigned location(s)
- `profiles_location_manager_update` → UPDATE — Location managers can only update ground staff profiles at their location(s)
- `profiles_org_owner_delete` → DELETE — Only org owners can soft-delete (deactivate) users in their organization

---

## 31. recipes
**Purpose:** Stores recipes with ingredients, costs, prep times, and suggested pricing for menu costing.
**Policies:**
- `Platform_Admin_Full` → ALL — Platform admin full access
- `Tenant_Isolation_recipes` → ALL — Own org members full access

---

## 32. vendors
**Purpose:** Stores vendor/supplier information linked to organizations and locations.
**Policies:**
- `Platform_Admin_Full` → ALL — Platform admin full access
- `Tenant_Isolation_vendors` → ALL — Own org members full access

---

## 33. wastage_logs
**Purpose:** Logs food waste events with reason, quantity, value, and who logged it.
**Policies:**
- `Platform_Admin_Full` → ALL — Platform admin full access
- `Tenant_Isolation_wastage_logs` → ALL — Own org members full access

---

## 34. webhook_events
**Purpose:** Stores incoming webhook events (e.g., from Stripe) for idempotent processing.
**Policies:**
- `Platform_Admin_Only_Webhook_Events` → ALL — Platform admin only

---

## 35. error_logs
**Purpose:** Stores frontend error reports from the error monitoring service for debugging.
**Policies:**
- `error_logs_authenticated_insert` → INSERT — Any authenticated user can log errors
- `error_logs_platform_admin_select` → SELECT — Only platform admins can read error logs
- `error_logs_platform_admin_manage` → DELETE — Only platform admins can delete old logs

---

## Security Hardening Notes (Migration 014)

### SECURITY DEFINER Function Access
All sensitive `SECURITY DEFINER` functions have had their execution rights revoked from `public` and `anon`. Only `authenticated` and `service_role` can call them:

| Function | Purpose |
|----------|---------|
| `get_auth_role()` | JWT-based role lookup (no table queries) |
| `get_auth_org()` | JWT-based org_id lookup (no table queries) |
| `can_invite_role(TEXT)` | Hierarchy check: can caller invite target role? |
| `get_my_accessible_brand_ids()` | Returns brand UUIDs the caller can access |
| `get_my_accessible_location_ids()` | Returns location UUIDs the caller can access |
| `setup_organization_full(...)` | Atomic onboarding RPC |
| `accept_invitation(UUID)` | Invitation acceptance RPC |
| `admin_update_user_role(...)` | Admin role update RPC |

### RLS InitPlan Optimization
The following policies wrap `auth.uid()` in `(SELECT auth.uid())` to cache the value per-query:
- `profiles_self_select`
- `profiles_self_update`
- `profiles_org_owner_delete`
- `invitations_cancel_own`

### Role Constraint
The `profiles_role_check` constraint enforces:
```
ground_staff, location_manager, branch_manager, org_owner, platform_admin
```

