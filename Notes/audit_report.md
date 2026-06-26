# Forensic Schema Audit Report

As requested, I've conducted a deep codebase forensic audit tracing the "blast-radius" of recent schema changes, specifically focusing on fields and logic that were dropped or modified but are still lurking in the code.

Here is the map of where the old schema still lives.

> [!WARNING]
> **High Severity: Edge Function Crashes**
> The `invite-user` edge function is still writing to dropped columns, which will cause runtime errors in production.

## 1. Dropped RBAC Columns (`page_permissions`, `signing_privileges`, `permissions`)
In `20260618143000_remove_legacy_access_levels.sql`, the legacy JSON columns (`permissions`, `page_permissions`, `signing_privileges`) were permanently dropped from `profiles`, `roles`, and `invitations`. However, these are still actively wired into Edge Functions and frontend payloads:

#### Edge Functions
* **[invite-user/index.ts](file:///c:/Users/ukart/OneDrive%20-%20University%20of%20Tennessee/M/INtern/MECURSOR/MEVS/code/supabase_functions/invite-user/index.ts)**
  * **Line 58**: Still extracts `page_permissions` and `signing_privileges` from the request body.
  * **Lines 192-197**: Explicitly maps `page_permissions` to `profilePayload.permissions` and `signing_privileges` to `profilePayload.signing_privileges`. **This will break the profile upsert** because these columns no longer exist in the `profiles` table.
  * **Lines 216-217**: Still attaching these fields to the response.

#### Frontend Context
* **[AuthContext.jsx](file:///c:/Users/ukart/OneDrive%20-%20University%20of%20Tennessee/M/INtern/MECURSOR/MEVS/code/src/lib/AuthContext.jsx)**
  * Still relying on a hardcoded matrix of `permissions`, though this acts as frontend state, it's a symptom of the old architecture remaining active.

## 2. Legacy Naming Convention: `org_id` vs `organization_id`
In `029_standardize_rls.sql`, the database standardized on `organization_id` by dropping `org_id` aliases. However, the `org_id` alias is heavily embedded in Edge Function inputs and frontend dispatch logic. 

#### Edge Functions (Payload Handlers)
* **[invite-user](file:///c:/Users/ukart/OneDrive%20-%20University%20of%20Tennessee/M/INtern/MECURSOR/MEVS/code/supabase_functions/invite-user/index.ts)**: Expects `org_id` from the payload body and maps it to `organization_id`.
* **[iot-webhook](file:///c:/Users/ukart/OneDrive%20-%20University%20of%20Tennessee/M/INtern/MECURSOR/MEVS/code/supabase/functions/iot-webhook/index.ts)**: Validates against `org_id` on incoming generic payloads.
* **[create-stripe-invoice](file:///c:/Users/ukart/OneDrive%20-%20University%20of%20Tennessee/M/INtern/MECURSOR/MEVS/code/supabase/functions/create-stripe-invoice/index.ts)** & **[create-checkout-session](file:///c:/Users/ukart/OneDrive%20-%20University%20of%20Tennessee/M/INtern/MECURSOR/MEVS/code/supabase/functions/create-checkout-session/index.ts)**: Both expect `org_id` in their `req.json()` body and use it for database lookups.
* **[calculate-depletion](file:///c:/Users/ukart/OneDrive%20-%20University%20of%20Tennessee/M/INtern/MECURSOR/MEVS/code/supabase/functions/calculate-depletion/index.ts)**: Extracts `org_id` to run depletion logic.

#### Frontend Payload Construction
The React components are still indiscriminately injecting `org_id` instead of `organization_id` into API and RPC calls. While some RPCs handle the `p_org_id` mapping, raw payload mismatches will break inserts.
* **[UserManagement.jsx](file:///c:/Users/ukart/OneDrive%20-%20University%20of%20Tennessee/M/INtern/MECURSOR/MEVS/code/src/pages/UserManagement.jsx)**: Passes `org_id` during invitation dispatches (`body: { email, role, org_id: orgId }`).
* **[PlatformInvoices.jsx](file:///c:/Users/ukart/OneDrive%20-%20University%20of%20Tennessee/M/INtern/MECURSOR/MEVS/code/src/pages/PlatformInvoices.jsx)** & **[Billing.jsx](file:///c:/Users/ukart/OneDrive%20-%20University%20of%20Tennessee/M/INtern/MECURSOR/MEVS/code/src/pages/Billing.jsx)**: Passing `org_id` downstream.
* **[apiClient.js](file:///c:/Users/ukart/OneDrive%20-%20University%20of%20Tennessee/M/INtern/MECURSOR/MEVS/code/src/lib/apiClient.js)**: Reconstructs state using `{ id: data.org_id, ... }`.

> [!TIP]
> The RPCs correctly expect `p_org_id` (e.g. `rpc-inventory.test.js`), but Edge Function `req.json()` bodies should be standardized to `organization_id` to match the table.

## 3. Legacy Access Levels (`access_level`)
While `access_level` was preserved as an argument in `admin_update_user_role` and remains in the `profiles` table, the codebase is in a transient state where old hardcoded logic assumes it governs permissions.

* **[PlatformUserManagement.jsx](file:///c:/Users/ukart/OneDrive%20-%20University%20of%20Tennessee/M/INtern/MECURSOR/MEVS/code/src/pages/PlatformUserManagement.jsx)**: Hardcodes `access_level: "platform"` on new creations.
* **[AuthContext.jsx](file:///c:/Users/ukart/OneDrive%20-%20University%20of%20Tennessee/M/INtern/MECURSOR/MEVS/code/src/lib/AuthContext.jsx)**: Still actively retrieves `sessionUser.app_metadata?.access_level`.

## 4. Schema-Per-Tenant Routing (`schema_name`)
The recent shift back to a shared tenancy (`retire_schema_tenant_rpc_surface.sql`) has left behind tenant routing artifacts.

* **[_shared/tenant-routing.ts](file:///c:/Users/ukart/OneDrive%20-%20University%20of%20Tennessee/M/INtern/MECURSOR/MEVS/code/supabase/functions/_shared/tenant-routing.ts)**: Currently hardcodes `schema_name: 'public'`. This is technically safe for now, but the routing wrapper itself is a vestige of the `schema-per-tenant` architecture that can be stripped out.
* **[TenantMigrationPanel.jsx](file:///c:/Users/ukart/OneDrive%20-%20University%20of%20Tennessee/M/INtern/MECURSOR/MEVS/code/src/components/platform/TenantMigrationPanel.jsx)**: Explicitly reads and depends on `snapshot.schema_name` checks to render. This UI component is safe but represents legacy technical debt.

---

### Recommended Immediate Action
1. Clean up [invite-user/index.ts](file:///c:/Users/ukart/OneDrive%20-%20University%20of%20Tennessee/M/INtern/MECURSOR/MEVS/code/supabase_functions/invite-user/index.ts) to completely strip out `profilePayload.permissions` and `profilePayload.signing_privileges` before the next user invite is attempted.
2. Standardize all edge function request payloads from `org_id` to `organization_id`.
