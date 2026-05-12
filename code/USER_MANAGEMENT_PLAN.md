# MECURSOR — User Management & Invitation: Strict RLS Plan

---

## 1. Organization Hierarchy

```
Platform Admin (SaaS Platform Manager — manages the MEVS platform itself)
  │
  ├── Organization A (Tenant)
  │     ├── Org Owner 1 ─┐
  │     ├── Org Owner 2 ─┤  (multiple org_owners per org)
  │     │                │
  │     ├── Brand X ─────┤
  │     │   ├── Branch Manager 1 ─┐
  │     │   ├── Branch Manager 2 ─┤  (multiple branch_managers per brand)
  │     │   │                     │
  │     │   ├── Location X1 ──────┤
  │     │   │   ├── Location Manager 1 ─┐
  │     │   │   ├── Location Manager 2 ─┤  (multiple location_managers per location)
  │     │   │   ├── Ground Staff 1 ─────┤
  │     │   │   ├── Ground Staff 2 ─────┤  (multiple ground_staff per location)
  │     │   │   └── Ground Staff 3 ─────┘
  │     │   │
  │     │   └── Location X2
  │     │       ├── Location Manager 1
  │     │       ├── Ground Staff 1
  │     │       └── Ground Staff 2
  │     │
  │     └── Brand Y
  │         ├── Branch Manager 1
  │         └── Location Y1
  │             ├── Location Manager 1
  │             └── Ground Staff 1
  │
  ├── Organization B (Tenant — completely isolated)
  │     └── ... (same structure)
  │
  └── Organization C (Tenant)
        └── ...
```

---

## 2. Role Definitions

| Role | Access Level | Scope | Multiplicity | Can Manage |
|---|---|---|---|---|
| `platform_admin` | `platform` | SaaS platform | Few (internal team) | Platform settings, billing, support — not org operational data |
| `org_owner` | `organization` | Own org | Multiple per org | All brands, locations, users within their org |
| `branch_manager` | `brand` | Own brand(s) | Multiple per brand | Locations and users under their assigned brand(s) |
| `location_manager` | `location` | Own location(s) | Multiple per location | Ground staff and operational data at their assigned location(s) |
| `ground_staff` | `location` | Own location | Multiple per location | Own profile only, view/enter data at their assigned location |

---

## 3. Current Problems (Too General)

### profiles table

| Current Policy | Problem |
|---|---|
| `Profile_Self_Access` → ALL where `auth.uid() = id` | ✅ OK — user manages own profile |
| `Profile_Org_Visibility` → SELECT where `org_id = get_auth_org()` | ⚠️ Too broad — ground_staff can see ALL org members |
| `Platform_Admin_Full` → ALL | ✅ OK |
| **Missing** | 🔴 No UPDATE restriction — who can edit other users' profiles? |
| **Missing** | 🔴 No DELETE restriction — who can deactivate/remove users? |

### invitations table

| Current Policy | Problem |
|---|---|
| `Platform_Admin_Full` → ALL | ✅ OK |
| `Tenant_Isolation_invitations` → ALL where `org_id = get_auth_org()` | 🔴 Any org member can CREATE/DELETE invitations |
| **Missing** | 🔴 No role-based check — ground_staff can invite org_owners |
| **Missing** | 🔴 No brand/location scoping — branch_manager sees all invitations |

### organizations table

| Current Policy | Problem |
|---|---|
| `Org_Self_Access` → SELECT where `id = get_auth_org()` | ✅ OK for read |
| `Platform_Admin_Full` → ALL | ✅ OK |
| **Missing** | 🔴 No UPDATE policy — who can edit org settings? (only org_owner should) |

---

## 4. Strict Policy Design

### 4A. profiles — Strict Policies

| Policy Name | Operation | Who | Rule |
|---|---|---|---|
| `Profile_Self_Read_Write` | SELECT, UPDATE | Self | `auth.uid() = id` — users read & edit own profile |
| `Profile_Org_Admin_View` | SELECT | org_owner | Can see all profiles in their org |
| `Profile_Brand_Manager_View` | SELECT | branch_manager | Can see profiles in their brand(s) only |
| `Profile_Location_Manager_View` | SELECT | location_manager | Can see profiles in their location(s) only |
| `Profile_Ground_Staff_View` | SELECT | ground_staff | Can see own profile only (via Self policy) |
| `Profile_Admin_Update` | UPDATE | org_owner, branch_manager | Can update profiles BELOW their role level |
| `Profile_Admin_Delete` | DELETE | org_owner only | Can soft-delete (deactivate) users in their org |
| `Platform_Admin_Full` | ALL | platform_admin | Full access to all profiles |

### 4B. invitations — Strict Policies

| Policy Name | Operation | Who | Rule |
|---|---|---|---|
| `Invitation_Create_With_Role_Check` | INSERT | org_owner, branch_manager, location_manager | Can only invite roles BELOW their level + scoped to their brand/location |
| `Invitation_View_Own_Org` | SELECT | org_owner | Can see all invitations in their org |
| `Invitation_View_Own_Brand` | SELECT | branch_manager | Can see invitations for their brand(s) |
| `Invitation_View_Own_Location` | SELECT | location_manager | Can see invitations for their location(s) |
| `Invitation_Cancel` | DELETE | Creator or org_owner | Can cancel invitations they created, or org_owner can cancel any |
| `Platform_Admin_Full` | ALL | platform_admin | Full access to all invitations |

### 4C. organizations — Strict Policies

| Policy Name | Operation | Who | Rule |
|---|---|---|---|
| `Org_Read_Members` | SELECT | All org members | Can read their own org's info |
| `Org_Owner_Update` | UPDATE | org_owner only | Only the org owner can update org settings |
| `Platform_Admin_Full` | ALL | platform_admin | Full access |

---

## 5. Data Tables: Organization Role Matrix

> **Note:** Platform Admin manages the SaaS platform itself (billing, support, platform config).
> They have full DB access for support purposes but do NOT operate within any organization.

### 5A. Who Can Invite Whom

| Inviter ↓ / Invitee → | org_owner | branch_manager | location_manager | ground_staff |
|---|---|---|---|---|
| **platform_admin** | ✅ (for support) | ✅ (for support) | ✅ (for support) | ✅ (for support) |
| **org_owner** | ✅ another org_owner | ✅ | ✅ | ✅ |
| **branch_manager** | ❌ | ✅ another branch_mgr | ✅ (own brand) | ✅ (own brand) |
| **location_manager** | ❌ | ❌ | ✅ another loc_mgr | ✅ (own location) |
| **ground_staff** | ❌ | ❌ | ❌ | ❌ |

### 5B. Who Can View Whom (Profiles)

| Viewer ↓ / Target → | org_owner(s) | branch_manager(s) | location_manager(s) | ground_staff |
|---|---|---|---|---|
| **platform_admin** | ✅ ALL orgs | ✅ ALL orgs | ✅ ALL orgs | ✅ ALL orgs |
| **org_owner** | ✅ Co-owners in org | ✅ All in org | ✅ All in org | ✅ All in org |
| **branch_manager** | ❌ | ✅ Self + same brand | ✅ Own brand locations | ✅ Own brand locations |
| **location_manager** | ❌ | ❌ | ✅ Self + same location | ✅ Own location |
| **ground_staff** | ❌ | ❌ | ❌ | ✅ Self only |

### 5C. Who Can Edit Whom (Profile Updates)

| Editor ↓ / Target → | org_owner(s) | branch_manager(s) | location_manager(s) | ground_staff |
|---|---|---|---|---|
| **platform_admin** | ✅ (support) | ✅ (support) | ✅ (support) | ✅ (support) |
| **org_owner** | ✅ Self only | ✅ Any in org | ✅ Any in org | ✅ Any in org |
| **branch_manager** | ❌ | ✅ Self only | ✅ Own brand | ✅ Own brand |
| **location_manager** | ❌ | ❌ | ✅ Self only | ✅ Own location |
| **ground_staff** | ❌ | ❌ | ❌ | ✅ Self only |

### 5D. Who Can Manage Org Settings

| Role | View Org | Edit Org Name/Settings | Manage Billing | Delete Org |
|---|---|---|---|---|
| **platform_admin** | ✅ (support) | ✅ (support) | ✅ (platform billing) | ✅ (support) |
| **org_owner** | ✅ | ✅ | ✅ | ❌ (request only) |
| **branch_manager** | ✅ (read only) | ❌ | ❌ | ❌ |
| **location_manager** | ✅ (read only) | ❌ | ❌ | ❌ |
| **ground_staff** | ✅ (read only) | ❌ | ❌ | ❌ |

---

## 6. SQL Implementation

### 6A. Drop Old General Policies

```sql
-- profiles: drop overly broad policies
DROP POLICY IF EXISTS "Profile_Org_Visibility" ON public.profiles;
DROP POLICY IF EXISTS "Profile_Self_Access" ON public.profiles;
DROP POLICY IF EXISTS "Platform_Admin_Full" ON public.profiles;

-- invitations: drop overly broad tenant isolation
DROP POLICY IF EXISTS "Tenant_Isolation_invitations" ON public.invitations;
DROP POLICY IF EXISTS "Platform_Admin_Full" ON public.invitations;

-- organizations: drop and recreate
DROP POLICY IF EXISTS "Org_Self_Access" ON public.organizations;
DROP POLICY IF EXISTS "Platform_Admin_Full" ON public.organizations;
```

### 6B. New Strict Policies — profiles

```sql
-- 1. Platform admin: full access
CREATE POLICY "profiles_platform_admin_full"
  ON public.profiles FOR ALL
  USING (get_auth_role() = 'platform_admin');

-- 2. Self: read and update own profile
CREATE POLICY "profiles_self_select"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_self_update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 3. Org owner: see all profiles in their org
CREATE POLICY "profiles_org_owner_select"
  ON public.profiles FOR SELECT
  USING (
    get_auth_role() = 'org_owner'
    AND organization_id = get_auth_org()
  );

-- 4. Org owner: update profiles in their org (except self-role-change handled by trigger)
CREATE POLICY "profiles_org_owner_update"
  ON public.profiles FOR UPDATE
  USING (
    get_auth_role() = 'org_owner'
    AND organization_id = get_auth_org()
  )
  WITH CHECK (
    get_auth_role() = 'org_owner'
    AND organization_id = get_auth_org()
  );

-- 5. Branch manager: see profiles in their brand(s)
CREATE POLICY "profiles_branch_manager_select"
  ON public.profiles FOR SELECT
  USING (
    get_auth_role() = 'branch_manager'
    AND organization_id = get_auth_org()
    AND brand_id IN (SELECT get_my_accessible_brand_ids())
  );

-- 6. Branch manager: update profiles in their brand (lower roles only)
CREATE POLICY "profiles_branch_manager_update"
  ON public.profiles FOR UPDATE
  USING (
    get_auth_role() = 'branch_manager'
    AND organization_id = get_auth_org()
    AND brand_id IN (SELECT get_my_accessible_brand_ids())
    AND role IN ('location_manager', 'ground_staff')
  )
  WITH CHECK (
    get_auth_role() = 'branch_manager'
    AND organization_id = get_auth_org()
    AND brand_id IN (SELECT get_my_accessible_brand_ids())
    AND role IN ('location_manager', 'ground_staff')
  );

-- 7. Location manager: see profiles at their location(s)
CREATE POLICY "profiles_location_manager_select"
  ON public.profiles FOR SELECT
  USING (
    get_auth_role() = 'location_manager'
    AND organization_id = get_auth_org()
    AND location_id IN (SELECT get_my_accessible_location_ids())
  );

-- 8. Location manager: update ground_staff at their location(s)
CREATE POLICY "profiles_location_manager_update"
  ON public.profiles FOR UPDATE
  USING (
    get_auth_role() = 'location_manager'
    AND organization_id = get_auth_org()
    AND location_id IN (SELECT get_my_accessible_location_ids())
    AND role = 'ground_staff'
  )
  WITH CHECK (
    get_auth_role() = 'location_manager'
    AND organization_id = get_auth_org()
    AND location_id IN (SELECT get_my_accessible_location_ids())
    AND role = 'ground_staff'
  );

-- 9. Org owner: soft-delete (deactivate) users in their org
CREATE POLICY "profiles_org_owner_delete"
  ON public.profiles FOR DELETE
  USING (
    get_auth_role() = 'org_owner'
    AND organization_id = get_auth_org()
    AND id != auth.uid()  -- cannot delete self
  );
```

### 6C. New Strict Policies — invitations

```sql
-- 1. Platform admin: full access
CREATE POLICY "invitations_platform_admin_full"
  ON public.invitations FOR ALL
  USING (get_auth_role() = 'platform_admin');

-- 2. Org owner: see all invitations in their org
CREATE POLICY "invitations_org_owner_select"
  ON public.invitations FOR SELECT
  USING (
    get_auth_role() = 'org_owner'
    AND organization_id = get_auth_org()
  );

-- 3. Branch manager: see invitations for their brand
CREATE POLICY "invitations_branch_manager_select"
  ON public.invitations FOR SELECT
  USING (
    get_auth_role() = 'branch_manager'
    AND organization_id = get_auth_org()
    AND brand_id IN (SELECT get_my_accessible_brand_ids())
  );

-- 4. Location manager: see invitations for their location
CREATE POLICY "invitations_location_manager_select"
  ON public.invitations FOR SELECT
  USING (
    get_auth_role() = 'location_manager'
    AND organization_id = get_auth_org()
    AND location_id IN (SELECT get_my_accessible_location_ids())
  );

-- 5. Insert: role-checked invitation creation (uses can_invite_role function)
CREATE POLICY "invitations_create_with_role_check"
  ON public.invitations FOR INSERT
  WITH CHECK (
    organization_id = get_auth_org()
    AND can_invite_role(role)
    AND get_auth_role() != 'ground_staff'
  );

-- 6. Delete (cancel): creator or org_owner can cancel
CREATE POLICY "invitations_cancel_own"
  ON public.invitations FOR DELETE
  USING (
    organization_id = get_auth_org()
    AND (
      invited_by = auth.uid()
      OR get_auth_role() = 'org_owner'
    )
  );

-- 7. Update: org_owner can update invitation details
CREATE POLICY "invitations_org_owner_update"
  ON public.invitations FOR UPDATE
  USING (
    get_auth_role() = 'org_owner'
    AND organization_id = get_auth_org()
  )
  WITH CHECK (
    get_auth_role() = 'org_owner'
    AND organization_id = get_auth_org()
  );
```

### 6D. New Strict Policies — organizations

```sql
-- 1. Platform admin: full access
CREATE POLICY "organizations_platform_admin_full"
  ON public.organizations FOR ALL
  USING (get_auth_role() = 'platform_admin');

-- 2. All org members: read their own org
CREATE POLICY "organizations_member_select"
  ON public.organizations FOR SELECT
  USING (id = get_auth_org());

-- 3. Org owner only: update their org settings
CREATE POLICY "organizations_owner_update"
  ON public.organizations FOR UPDATE
  USING (
    id = get_auth_org()
    AND get_auth_role() = 'org_owner'
  )
  WITH CHECK (
    id = get_auth_org()
    AND get_auth_role() = 'org_owner'
  );
```

---

## 7. Summary of Changes

| Table | Before (General) | After (Strict) |
|---|---|---|
| **profiles** | Any org member → ALL access | Role-scoped: self, org_owner→org, branch_mgr→brand, loc_mgr→location |
| **invitations** | Any org member → ALL access | Role-checked INSERT, scoped SELECT, creator/owner DELETE |
| **organizations** | Any member → SELECT only | Member SELECT + org_owner-only UPDATE |

### Total New Policies

- **profiles**: 9 policies (was 3)
- **invitations**: 7 policies (was 2)
- **organizations**: 3 policies (was 2)
