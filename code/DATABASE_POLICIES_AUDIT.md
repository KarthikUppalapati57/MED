# MEVS Database RLS Policy & Row Creation Audit

This document is a formal audit of all **35 tables** in the database. It outlines their function, RLS policies, current row counts, and row creation capacity.

---

## 🏛️ General Row Creation Capabilities

* **Client / Application Level:** The number of rows a user can create depends entirely on their specific RLS role (`platform_admin`, `org_owner`, `branch_manager`, `location_manager`, `ground_staff`, or `anonymous`).
* **Database / Server Level:** There is **no database-enforced row limit**. You can create an **unlimited** number of rows. Creation is governed strictly by the storage limits of your Supabase hosting tier (e.g., 500 MB for Free tier, scalable to terabytes on Pro/Enterprise tiers).

---

## 📋 Comprehensive Table Directory

### 1. `access_requests`

* **Purpose:** Stores requests submitted by prospective corporate partners seeking access to the MEVS platform.
* **RLS Policies:** 3 policies
  * `Admin_Read_Access_Requests` (SELECT): Allow read only if `get_auth_role() = 'platform_admin'`.
  * `Admin_Manage_Access_Requests` (UPDATE): Allow updates only if `get_auth_role() = 'platform_admin'`.
  * `Anon_Insert_Access_Requests` (INSERT): Allow public anonymous/authenticated users to submit requests.
* **Current Rows:** 0
* **Creation Capacity:**
  * **Public/Visitor:** Unlimited entries (for request submission).
  * **Administrative:** Full control.

### 2. `archived_brands`

* **Purpose:** Houses historical records of deleted brand records for auditing and schema retention.
* **RLS Policies:** 1 policy
  * `Platform_Admin_Only_Archived_Brands` (ALL): Restricted to `get_auth_role() = 'platform_admin'`.
* **Current Rows:** 2
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Administrative:** Unlimited (triggered on deletion).

### 3. `archived_invitations`

* **Purpose:** Historical log of deleted or processed invitations for security audit audits.
* **RLS Policies:** 1 policy
  * `Platform_Admin_Only_Archived_Invitations` (ALL): Restricted to `get_auth_role() = 'platform_admin'`.
* **Current Rows:** 0
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Administrative:** Unlimited.

### 4. `archived_locations`

* **Purpose:** Archives location records when deleted, preventing accidental data loss of physical store profiles.
* **RLS Policies:** 1 policy
  * `Platform_Admin_Only_Archived_Locations` (ALL): Restricted to `get_auth_role() = 'platform_admin'`.
* **Current Rows:** 2
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Administrative:** Unlimited.

### 5. `archived_organizations`

* **Purpose:** Keeps corporate history records of deleted enterprise organizations.
* **RLS Policies:** 1 policy
  * `Platform_Admin_Only_Archived_Organizations` (ALL): Restricted to `get_auth_role() = 'platform_admin'`.
* **Current Rows:** 3
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Administrative:** Unlimited.

### 6. `archived_profiles`

* **Purpose:** Safely logs historical employee user profiles when an auth user account is deleted from the system.
* **RLS Policies:** 1 policy
  * `Platform_Admin_Only_Archived_Profiles` (ALL): Restricted to `get_auth_role() = 'platform_admin'`.
* **Current Rows:** 3
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Administrative:** Unlimited.

### 7. `audit_logs`

* **Purpose:** Stores comprehensive system security logs, database manipulations, and user events for regulatory compliance.
* **RLS Policies:** 3 policies
  * `Audit_Log_Isolation` (SELECT): Visible to members of the organization (`organization_id = get_auth_org()`) OR platform admins.
  * `audit_logs_authenticated_insert` (INSERT): Visible/writable by any authenticated session.
  * `audit_logs_platform_admin_full` (ALL): Platform Admin has complete privileges.
* **Current Rows:** 35
* **Creation Capacity:**
  * **Public/Visitor:** Writable only when authenticated.
  * **Administrative:** Unlimited.

### 8. `auto_orders`

* **Purpose:** Sets and maintains auto-replenishment threshold guidelines for restaurant items.
* **RLS Policies:** 2 policies
  * `Tenant_Isolation_auto_orders` (ALL): Restricted to members of the owner organization (`organization_id = get_auth_org()`).
  * `Platform_Admin_Full` (ALL): Platform Admin full access.
* **Current Rows:** 0
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Tenant Employees:** Unlimited within their own organization.

### 9. `brands`

* **Purpose:** Stores corporate sub-brands under organizations (e.g., individual restaurant brand names).
* **RLS Policies:** 2 policies
  * `Tenant_Isolation_brands` (ALL): Isolated by organization id (`organization_id = get_auth_org()`).
  * `Platform_Admin_Full` (ALL): Platform Admin full access.
* **Current Rows:** 1
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Tenant Owners:** Unlimited under their assigned organization.

### 10. `contact_requests`

* **Purpose:** Collects customer inquiries from the public website contact form.
* **RLS Policies:** 3 policies
  * `Admin_Read_Contact_Requests` (SELECT): Only readable by platform administrators.
  * `Admin_Manage_Contact_Requests` (UPDATE): Only updateable by platform administrators.
  * `Anon_Insert_Contact_Requests` (INSERT): Allows anyone to write incoming inquiries.
* **Current Rows:** 0
* **Creation Capacity:**
  * **Public/Visitor:** Unlimited submissions.
  * **Administrative:** Full control.

### 11. `demo_requests`

* **Purpose:** Logs all trial and product demo bookings submitted from the landing site.
* **RLS Policies:** 3 policies
  * `Admin_Read_Demo_Requests` (SELECT): Only readable by platform administrators.
  * `Admin_Manage_Demo_Requests` (UPDATE): Only manageable by platform administrators.
  * `Anon_Insert_Demo_Requests` (INSERT): Publicly writable by anonymous/authenticated prospects.
* **Current Rows:** 0
* **Creation Capacity:**
  * **Public/Visitor:** Unlimited submissions.
  * **Administrative:** Full control.

### 12. `dim_date`

* **Purpose:** Static time dimension lookup table for reporting and time-series aggregations in analytical widgets.
* **RLS Policies:** 2 policies
  * `Authenticated_Read_Dim_Date` (SELECT): Any logged-in system user can read.
  * `Platform_Admin_Full_Dim_Date` (ALL): Full platform administrator permissions.
* **Current Rows:** 4,018
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Administrative:** Unlimited (pre-seeded for years of coverage).

### 13. `dim_product`

* **Purpose:** Product dimension warehouse record mirroring for rapid star-schema queries.
* **RLS Policies:** 2 policies
  * `Tenant_Read_Dim_Product` (SELECT): Read-only matching organization context.
  * `Platform_Admin_Full_Dim_Product` (ALL): Complete access.
* **Current Rows:** 2
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Automated Sync / Admin:** Automated creation matching source changes.

### 14. `dim_user`

* **Purpose:** User/employee warehouse dimension for fast reporting on key metrics.
* **RLS Policies:** 2 policies
  * `Tenant_Read_Dim_User` (SELECT): Isolated reads for matching organizations.
  * `Platform_Admin_Full_Dim_User` (ALL): Complete access.
* **Current Rows:** 2
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **System Sync:** Automatic on user creation.

### 15. `dim_vendor`

* **Purpose:** Vendor dimensional records for operational logistics reporting.
* **RLS Policies:** 2 policies
  * `Tenant_Read_Dim_Vendor` (SELECT): Isolated reads for matching organizations.
  * `Platform_Admin_Full_Dim_Vendor` (ALL): Complete access.
* **Current Rows:** 0
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **System Sync:** Automatic.

### 16. `error_logs`

* **Purpose:** Captures client-side and server-side errors, trace logs, and system faults.
* **RLS Policies:** 3 policies
  * `error_logs_authenticated_insert` (INSERT): Writable by any logged-in user session.
  * `error_logs_platform_admin_select` (SELECT): Readable only by platform administrators.
  * `error_logs_platform_admin_manage` (DELETE): Deletable only by platform administrators.
* **Current Rows:** 30
* **Creation Capacity:**
  * **Public/Visitor:** Writable only when authenticated.
  * **Administrative:** Unlimited.

### 17. `fact_inventory`

* **Purpose:** Fact table recording periodic snapshot logs of stock levels.
* **RLS Policies:** 2 policies
  * `Tenant_Read_Fact_Inventory` (SELECT): Writable internally, read isolated to org context.
  * `Platform_Admin_Full_Fact_Inventory` (ALL): Complete access.
* **Current Rows:** 2
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **System Sync:** Unlimited.

### 18. `fact_invoices`

* **Purpose:** Transactional facts table logging revenue, expenditures, and bill trends.
* **RLS Policies:** 2 policies
  * `Tenant_Read_Fact_Invoices` (SELECT): Writable internally, read isolated by organization.
  * `Platform_Admin_Full_Fact_Invoices` (ALL): Complete access.
* **Current Rows:** 0
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **System Sync:** Unlimited.

### 19. `fact_orders`

* **Purpose:** Logs order counts, metrics, and transaction trends.
* **RLS Policies:** 2 policies
  * `Tenant_Read_Fact_Orders` (SELECT): Read isolated by organization.
  * `Platform_Admin_Full_Fact_Orders` (ALL): Complete access.
* **Current Rows:** 0
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **System Sync:** Unlimited.

### 20. `fact_payments`

* **Purpose:** Logs analytical metric records for settled supplier invoices.
* **RLS Policies:** 2 policies
  * `Tenant_Read_Fact_Payments` (SELECT): Read isolated to org context.
  * `Platform_Admin_Full_Fact_Payments` (ALL): Complete access.
* **Current Rows:** 0
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **System Sync:** Unlimited.

### 21. `fact_wastage`

* **Purpose:** logs analytical loss facts on food spoilage and inventory shrinkage.
* **RLS Policies:** 2 policies
  * `Tenant_Read_Fact_Wastage` (SELECT): Read isolated to org context.
  * `Platform_Admin_Full_Fact_Wastage` (ALL): Complete access.
* **Current Rows:** 0
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **System Sync:** Unlimited.

### 22. `inventory`

* **Purpose:** Tracks live product stock quantities, safety margins, and storage locations.
* **RLS Policies:** 5 policies
  * `inventory_select_org` (SELECT): Writable/readable isolated to matching organization.
  * `inventory_insert_org` (INSERT): Writable isolated to matching organization.
  * `inventory_update_org` (UPDATE): Restricted to `org_owner`, `branch_manager`, `location_manager`, or `platform_admin`.
  * `inventory_delete_org` (DELETE): Restricted to `org_owner`, `branch_manager`, or `platform_admin`.
  * `Platform_Admin_Full` (ALL): Complete access.
* **Current Rows:** 2
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Tenant Employees:** Unlimited within their own organization.

### 23. `invitations`

* **Purpose:** Stores pending onboard invites for system employees.
* **RLS Policies:** 7 policies
  * `invitations_platform_admin_full` (ALL): Complete access.
  * `invitations_org_owner_select` (SELECT): Read isolated for org owner.
  * `invitations_branch_manager_select` (SELECT): Reads filtered by brands accessible.
  * `invitations_location_manager_select` (SELECT): Reads filtered by locations accessible.
  * `invitations_create_with_role_check` (INSERT): Restricts creation to appropriate roles (must not be ground_staff).
  * `invitations_org_owner_update` (UPDATE): Org owner restricted.
  * `invitations_cancel_own` (DELETE): Delete allowed by inviter or org owner.
* **Current Rows:** 10
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Tenant Managers/Owners:** Unlimited onboarding requests.

### 24. `invoices`

* **Purpose:** Holds records of supplier invoices, scanned documents, line items, and approval states.
* **RLS Policies:** 5 policies
  * `invoices_select_org` (SELECT): Tenant-isolated reads.
  * `invoices_insert_org` (INSERT): Tenant-isolated inserts.
  * `invoices_update_org` (UPDATE): Restricted to managers or creator if pending review.
  * `invoices_delete_org` (DELETE): Restricted to owner/branch manager.
  * `Platform_Admin_Full` (ALL): Platform admin full access.
* **Current Rows:** 0
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Tenant Employees:** Unlimited.

### 25. `locations`

* **Purpose:** Lists brick-and-mortar restaurant branch units.
* **RLS Policies:** 2 policies
  * `Tenant_Isolation_locations` (ALL): Tenant isolated (`organization_id = get_auth_org()`).
  * `Platform_Admin_Full` (ALL): Platform admin full access.
* **Current Rows:** 1
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Tenant Owners:** Unlimited.

### 26. `notifications`

* **Purpose:** Stores personalized alerts and activity feed tasks for employees.
* **RLS Policies:** 2 policies
  * `Tenant_Isolation_notifications` (ALL): Tenant isolated (`organization_id = get_auth_org()`).
  * `Platform_Admin_Full` (ALL): Platform admin full access.
* **Current Rows:** 0
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **System triggers:** Unlimited notifications.

### 27. `organizations`

* **Purpose:** Defines top-level corporate tenants subscribing to the platform.
* **RLS Policies:** 3 policies
  * `organizations_member_select` (SELECT): Visible if user matches org.
  * `organizations_owner_update` (UPDATE): Writable only if org owner.
  * `organizations_platform_admin_full` (ALL): Platform admin full access.
* **Current Rows:** 2
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Platform Admin:** Unlimited creation.

### 28. `payments`

* **Purpose:** Logs tenant-level payments made to third-party suppliers/vendors to settle inventory invoices (e.g., storing vendor names, bank references, cheque numbers, and settlement dates). It does **NOT** store MEVS platform subscription billing, Stripe transaction logs, or tenant membership plans.
* **RLS Policies:** 2 policies
  * `Tenant_Isolation_payments` (ALL): Tenant-isolated.
  * `Platform_Admin_Full` (ALL): Platform admin full access.
* **Current Rows:** 0
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Tenant Owners:** Unlimited transactions.

### 29. `plans`

* **Purpose:** Standard platform pricing plans and feature-limits tier templates.
* **RLS Policies:** 2 policies
  * `Public_Read_Plans` (SELECT): Any public or authenticated session can read.
  * `Platform_Admin_Full_Plans` (ALL): Platform admin full access.
* **Current Rows:** 5
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Platform Admin:** Unlimited.

### 30. `products`

* **Purpose:** Stores menu components, items, prices, and food metrics.
* **RLS Policies:** 5 policies
  * `products_select_org` (SELECT): Tenant-isolated.
  * `products_insert_org` (INSERT): Tenant-isolated.
  * `products_update_org` (UPDATE): Restricted to managers or higher.
  * `products_delete_org` (DELETE): Restricted to owner/branch managers.
  * `Platform_Admin_Full` (ALL): Platform admin full access.
* **Current Rows:** 2
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Tenant Managers/Owners:** Unlimited.

### 31. `profiles`

* **Purpose:** Houses platform metadata, permissions, and roles mapped to active system users.
* **RLS Policies:** 10 policies
  * `profiles_self_select` (SELECT): User can view self.
  * `profiles_self_update` (UPDATE): User can update self.
  * `profiles_org_owner_select` (SELECT): Owner can view organization.
  * `profiles_org_owner_update` (UPDATE): Owner can update members.
  * `profiles_org_owner_delete` (DELETE): Owner can delete profiles.
  * `profiles_branch_manager_select` (SELECT): Filtered by accessible brands.
  * `profiles_branch_manager_update` (UPDATE): Restricted update permissions.
  * `profiles_location_manager_select` (SELECT): Filtered by locations.
  * `profiles_location_manager_update` (UPDATE): Restricted update.
  * `profiles_platform_admin_full` (ALL): Platform admin full access.
* **Current Rows:** 1
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **System (Trigger):** Automatically spawns one matching row upon user Auth registration.

### 32. `recipes`

* **Purpose:** Stores formulations, raw component costs, and scaling rules for menu prep.
* **RLS Policies:** 2 policies
  * `Tenant_Isolation_recipes` (ALL): Tenant isolated.
  * `Platform_Admin_Full` (ALL): Platform admin full access.
* **Current Rows:** 0
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Tenant Managers/Owners:** Unlimited.

### 33. `vendors`

* **Purpose:** Records suppliers, distributors, email contacts, and pricing contracts.
* **RLS Policies:** 2 policies
  * `Tenant_Isolation_vendors` (ALL): Tenant isolated.
  * `Platform_Admin_Full` (ALL): Platform admin full access.
* **Current Rows:** 0
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Tenant Managers/Owners:** Unlimited.

### 34. `wastage_logs`

* **Purpose:** Tracks kitchen spoilage, spills, expired items, and raw food waste costs.
* **RLS Policies:** 2 policies
  * `Tenant_Isolation_wastage_logs` (ALL): Tenant isolated.
  * `Platform_Admin_Full` (ALL): Platform admin full access.
* **Current Rows:** 0
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Tenant Employees:** Unlimited logs.

### 35. `webhook_events`

* **Purpose:** Audit record database capturing direct incoming events from the Stripe billing system.
* **RLS Policies:** 1 policy
  * `Platform_Admin_Only_Webhook_Events` (ALL): Restricted to `get_auth_role() = 'platform_admin'`.
* **Current Rows:** 0
* **Creation Capacity:**
  * **Public/Visitor:** Blocked.
  * **Stripe Integration webhook:** Unlimited logging.
