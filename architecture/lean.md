# Lean Azure Replatforming Blueprint

## Under-$50 Monthly Azure Architecture and Migration Handover Plan

**Architecture Type:** Lean Azure-Native SaaS Replatforming
**Budget Ceiling:** $50/month Azure runtime cost
**Target Region:** East US or East US 2
**Current Platform:** Vercel + React + Supabase
**Target Platform:** Azure managed services
**Initial Scale:** Early customer production / pilot SaaS
**Deployment Model:** One shared multi-tenant platform
**Kubernetes Decision:** No AKS
**Enterprise Availability Decision:** Deferred until revenue or contractual requirements justify it

---

# 1. Executive Decision

The platform will move from Vercel and Supabase to Azure using a low-cost managed-services architecture.

The target is not a full enterprise landing zone. It is a secure, controlled, single-region startup platform capable of supporting:

* Platform administrators.
* Tenant organizations.
* Brands and restaurant locations.
* Restaurant owners, managers, and ground staff.
* Invoices and document uploads.
* Orders, inventory, products, recipes, vendors, and labor.
* Payment and accounting workflows.
* POS, Stripe, QuickBooks, vendor, email, and OCR integrations.
* Audit records.
* Scheduled jobs.
* Controlled asynchronous processing.

The architecture must remain below $50 per month for the permanent Azure footprint.

To meet this budget, the platform will use:

```text
Azure Static Web Apps Free
Azure Container Apps Consumption
Azure Functions Flex Consumption
Azure Database for PostgreSQL Flexible Server B1ms
Azure Blob Storage
Azure Queue Storage
Azure Event Grid
Azure Key Vault
Azure Container Registry Basic
Microsoft Entra External ID
Application Insights with strict log limits
Terraform
```

The platform will not initially use:

```text
Azure Kubernetes Service
Azure Front Door
Azure Web Application Firewall
Azure API Management
Azure Cache for Redis
Azure Service Bus
Azure Web PubSub
Azure Firewall
Private Endpoints for every service
Multi-region failover
Zone-redundant PostgreSQL HA
Dedicated tenant subscriptions
Permanent Dev + Test + UAT + Production environments
```

---

# 2. Budget Reality and Operating Assumptions

This design remains under $50 only when the following assumptions are true.

| Category                    | Assumption                                      |
| --------------------------- | ----------------------------------------------- |
| Monthly active users        | Under 500 initially                             |
| Entra External ID users     | Under 50,000 MAUs                               |
| Database size               | Under 32 GiB initially                          |
| Invoice and receipt storage | Under 50 GB initially                           |
| API volume                  | Low to moderate                                 |
| Container API               | Scales to zero when idle                        |
| Background jobs             | Event-driven and short-running                  |
| Realtime                    | Polling rather than persistent WebSockets       |
| UAT                         | Created temporarily and destroyed after testing |
| Region                      | Single Azure region                             |
| Availability                | No active-active or zone-redundant architecture |
| Support model               | Startup support and manual recovery procedures  |
| Logs                        | Sampling, caps, and short retention periods     |

This is suitable for an early customer-production platform. It is not suitable for a customer contract requiring 99.9% uptime, private connectivity to every service, 24x7 operational support, or zero-downtime database failover.

---

# 3. Lean Target Architecture

```text
                    ┌─────────────────────────────┐
                    │ Restaurant Users             │
                    │ Platform Admins              │
                    │ Mobile App Users             │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                   ┌──────────────────────────────┐
                   │ Microsoft Entra External ID  │
                   │ Tenant user authentication   │
                   └──────────────┬───────────────┘
                                  │ JWT
                                  ▼
        ┌─────────────────────────────────────────────────┐
        │ Azure Static Web Apps Free                       │
        │ React / Vite frontend                            │
        │ app.companydomain.com                            │
        └───────────────────┬─────────────────────────────┘
                            │ HTTPS API calls
                            ▼
        ┌─────────────────────────────────────────────────┐
        │ Azure Container App: restops-core-api            │
        │ api.companydomain.com                            │
        │ External ingress + managed TLS certificate       │
        │                                                 │
        │ Logical modules inside one deployable API:       │
        │ - Identity and Organization                      │
        │ - Users, Roles, Teams                            │
        │ - Products, Vendors, Recipes                     │
        │ - Orders, Receiving, Invoices                    │
        │ - Inventory and Stock Counts                     │
        │ - Payments and Accounting                        │
        │ - Labor and Scheduling                           │
        │ - Reporting and Notifications                    │
        │ - Integration Configuration                      │
        └───────────────┬─────────────────────────────────┘
                        │ Private network traffic
                        ▼
    ┌─────────────────────────────────────────────────────────┐
    │ Azure Virtual Network                                    │
    │                                                         │
    │  snet-containerapps    - Container Apps environment    │
    │  snet-functions        - Flex Consumption Functions    │
    │  snet-postgresql       - Delegated PostgreSQL subnet   │
    └───────────────┬─────────────────────────────────────────┘
                    │
                    ▼
    ┌─────────────────────────────────────────────────────────┐
    │ Azure Database for PostgreSQL Flexible Server            │
    │ B1ms Burstable | 32 GiB | Private access                │
    │                                                         │
    │ - System of record                                      │
    │ - Multi-tenant tables                                   │
    │ - PostgreSQL RLS                                        │
    │ - Organization / location data                          │
    │ - Orders / inventory / invoices / payments              │
    │ - Audit logs                                            │
    │ - Transactional outbox                                  │
    └─────────────────────────────────────────────────────────┘

    ┌──────────────────────┐       ┌───────────────────────────┐
    │ Azure Blob Storage   │──────▶│ Azure Event Grid           │
    │ invoices, receipts,  │       │ Blob-created events        │
    │ attachments          │       └─────────────┬─────────────┘
    └──────────────────────┘                     │
                                                  ▼
                                 ┌─────────────────────────────────┐
                                 │ Azure Functions Flex Consumption│
                                 │                                 │
                                 │ - Stripe webhooks               │
                                 │ - POS webhooks                  │
                                 │ - Blob processing               │
                                 │ - Invoice extraction            │
                                 │ - Email processing              │
                                 │ - Scheduled SmartPrep           │
                                 │ - Scheduled reports             │
                                 │ - Queue consumers               │
                                 │ - Retry and cleanup jobs        │
                                 └─────────────┬───────────────────┘
                                               │
                                               ▼
                              ┌─────────────────────────────────┐
                              │ Azure Queue Storage             │
                              │ Low-cost async jobs             │
                              │ Poison queue                    │
                              │ Retry processing                │
                              └─────────────────────────────────┘

    ┌────────────────────────┐        ┌───────────────────────────┐
    │ Azure Key Vault        │        │ Application Insights       │
    │ Secrets and API keys   │        │ Logs, errors, traces       │
    └────────────────────────┘        │ Strict daily cap          │
                                      └───────────────────────────┘
```

---

# 4. Core Design Principles

## 4.1 One Modular Backend API

The platform will begin with one backend Container App instead of separate microservices.

```text
restops-core-api
```

The codebase must still be modular.

```text
src/
├── identity/
├── organizations/
├── users/
├── permissions/
├── products/
├── vendors/
├── recipes/
├── inventory/
├── orders/
├── invoices/
├── payments/
├── accounting/
├── labor/
├── reports/
├── notifications/
├── integrations/
├── audit/
└── shared/
```

This avoids paying for eight to ten always-on services while preserving future separation paths.

When a module becomes resource-heavy, it can later be extracted.

Examples:

```text
Future extraction candidates:
- integration-worker
- procurement-api
- finance-api
- reporting-worker
- invoice-processing-worker
```

---

## 4.2 No Direct Browser-to-Database Access

The React application must not connect directly to PostgreSQL.

The browser must use:

```text
React frontend
    |
JWT
    |
Azure Container Apps API
    |
Authorized database transaction
    |
PostgreSQL RLS
```

The API becomes the mandatory enforcement point for:

* Tenant membership.
* Organization access.
* Brand scope.
* Location scope.
* Module permissions.
* Feature-plan checks.
* Audit events.
* Input validation.
* Rate limits.
* Signed upload URLs.

---

## 4.3 Tenant Security Model

The platform retains the existing business role model.

```text
platform_admin
org_owner
branch_manager
location_manager
ground_staff
```

The identity model is:

```text
Microsoft Entra identity
        |
        ▼
Application user record
        |
        ▼
Organization membership
        |
        ▼
Role assignment
        |
        ▼
Brand and location scope
        |
        ▼
API authorization
        |
        ▼
PostgreSQL RLS enforcement
```

The application database must contain at least:

```text
users
organizations
brands
locations
organization_memberships
user_location_assignments
roles
permissions
feature_entitlements
audit_logs
```

A user’s email address must not be used as the permanent authorization key.

Use the Entra subject ID or object ID as the durable external identity reference.

---

## 4.4 PostgreSQL RLS Design

PostgreSQL Row-Level Security remains mandatory.

Supabase-specific helper functions such as `auth.uid()` must be replaced.

The correct transaction pattern is:

```text
1. API validates Entra JWT.
2. API loads the internal user and active membership.
3. API calculates organization, brand, location, and role scope.
4. API begins a database transaction.
5. API sets validated transaction-local context.
6. PostgreSQL RLS evaluates the context.
7. Query executes.
8. Audit record is written where required.
9. Transaction commits or rolls back.
```

The browser must never send an organization ID that directly controls database permissions.

The application runtime database role must:

* Not own tables.
* Not bypass RLS.
* Not have superuser privileges.
* Not run migrations.
* Only execute approved application operations.

---

# 5. Low-Cost Security Architecture

## 5.1 What Is Protected

| Layer            | Protection                                                              |
| ---------------- | ----------------------------------------------------------------------- |
| Frontend         | Static Web Apps managed HTTPS                                           |
| API              | Entra JWT validation, CORS allowlist, API rate limits, input validation |
| Database         | Private VNet integration, no public endpoint, TLS, RLS                  |
| Secrets          | Key Vault and Managed Identity                                          |
| File uploads     | Short-lived user delegation SAS URLs                                    |
| Blob storage     | Anonymous access disabled, shared key access disabled where feasible    |
| Background jobs  | Queue visibility timeout, retries, poison queue                         |
| Financial events | Idempotency keys, webhook signature validation, audit records           |
| Terraform state  | Separate storage container, versioning, soft delete                     |
| Logging          | Scrub secrets, tokens, invoice payloads, and card-related information   |

## 5.2 Accepted Budget Risks

The following risks are consciously accepted to remain under $50.

| Deferred Capability      | Accepted Startup Risk                                     |
| ------------------------ | --------------------------------------------------------- |
| Azure Front Door and WAF | No enterprise edge WAF protection                         |
| API Management           | No managed gateway policies or developer portal           |
| PostgreSQL HA            | Database outage requires restore or manual recovery       |
| Multi-region DR          | Regional outage may cause prolonged downtime              |
| Private Endpoints        | Key Vault and Blob use identity-based public endpoints    |
| Redis                    | Slower repeated reads until caching becomes necessary     |
| Web PubSub               | Dashboard and invoice updates use polling                 |
| Service Bus              | Storage Queue has fewer enterprise messaging capabilities |
| Always-on APIs           | Cold starts may occur after idle periods                  |
| Permanent UAT            | Release validation uses temporary environments            |

These are acceptable only while customer expectations and traffic remain low.

---

# 6. Core Business Workflow Architecture

## 6.1 Tenant Onboarding

```text
Platform Admin
    |
React Platform Console
    |
restops-core-api
    |
Create organization
Create owner membership
Assign starter plan
Create default hierarchy
Create audit record
Send invitation email
    |
Restaurant Owner
    |
Entra External ID registration or password reset flow
    |
Owner accesses only assigned organization
```

No Terraform runs when a standard tenant is created.

Terraform creates infrastructure only.

The application creates:

* Organization.
* Brand.
* Location.
* Team member.
* Plan assignment.
* Feature entitlement.
* Tenant-scoped business records.

---

## 6.2 Invoice Upload and Processing

```text
Ground Staff
    |
React / Mobile App
    |
POST /uploads/invoice-authorize
    |
API validates organization + location + role
    |
API creates invoice record with status = UPLOADING
    |
API generates short-lived Blob SAS upload URL
    |
Browser uploads invoice directly to Blob Storage
    |
Blob Created Event
    |
Event Grid
    |
Azure Function
    |
Validate file
Create processing job
Queue job in Azure Queue Storage
    |
Invoice Processor Function
    |
Run existing OCR / AI extraction logic
    |
Update PostgreSQL invoice status and extracted data
    |
Create notification record
    |
React Query polls invoice status endpoint
    |
Manager reviews and approves invoice
```

The invoice-processing function must be idempotent.

Each invoice processing event must use:

```text
invoice_id
processing_attempt
source_blob_etag
idempotency_key
status
failure_reason
```

---

## 6.3 Stripe and Payment Webhook Flow

```text
Stripe
    |
POST /webhooks/stripe
    |
Azure Function HTTP endpoint
    |
Verify Stripe signature
    |
Check webhook event ID for duplicate delivery
    |
Store webhook receipt
    |
Write transactional outbox event
    |
Queue payment-related work
    |
Worker updates payment status
    |
Accounting entry is created
    |
Audit record is written
```

The webhook handler must return quickly.

Complex payment logic must occur asynchronously.

The system must never execute a payment twice because of retries.

---

## 6.4 POS and Vendor Integration Flow

```text
POS / Vendor / QuickBooks
    |
Webhook or scheduled sync
    |
Azure Function
    |
Signature validation
    |
Raw payload stored securely
    |
Queue processing job
    |
Integration worker processes payload
    |
PostgreSQL records updated
    |
Outbox event written
    |
Dashboard / report refreshes during next polling interval
```

Use a raw integration payload table only for necessary troubleshooting and reconciliation.

Apply retention policies to integration payloads.

---

# 7. Low-Cost Async Processing Design

Instead of Azure Service Bus, use Azure Queue Storage.

## 7.1 Queue Names

```text
invoice-processing
invoice-retry
pos-sync
vendor-sync
stripe-events
email-dispatch
scheduled-reports
smartprep-processing
outbox-dispatch
dead-letter
```

## 7.2 Transactional Outbox Pattern

The API must not update critical business data and publish a message independently.

Use this pattern:

```text
Business transaction begins
    |
Insert or update business data
    |
Insert outbox event in the same PostgreSQL transaction
    |
Commit transaction
    |
Outbox dispatcher reads unsent records
    |
Writes queue message
    |
Marks outbox record as published
    |
Worker processes queue message
    |
Worker writes result and audit data
```

This protects invoice, payment, order, and inventory workflows from lost events.

---

# 8. Realtime Replacement Strategy

Supabase Realtime will not be replaced initially.

Use React Query polling.

| Workflow            | Initial Update Pattern                                     |
| ------------------- | ---------------------------------------------------------- |
| Invoice processing  | Poll every 10 seconds while processing                     |
| Payment status      | Poll every 15–30 seconds while pending                     |
| Dashboard widgets   | Refresh every 60 seconds                                   |
| Notifications inbox | Refresh on open and every 60 seconds                       |
| Inventory counts    | Refresh after save or every 30 seconds                     |
| Orders              | Refresh after action and periodically                      |
| Reports             | Manual refresh plus scheduled background completion status |

This eliminates Web PubSub cost and operational complexity.

Upgrade to Azure Web PubSub only when real-time behavior becomes materially important to restaurant operations.

---

# 9. Production Azure Cost Estimate

## 9.1 Monthly Baseline

| Service                                      | Configuration                               | Estimated Monthly Cost |
| -------------------------------------------- | ------------------------------------------- | ---------------------: |
| Azure Database for PostgreSQL                | B1ms compute                                |                 $12.41 |
| PostgreSQL storage                           | 32 GiB minimum allocation                   |                  $3.68 |
| Azure Container Registry                     | Basic                                       |                  $5.08 |
| Azure Static Web Apps                        | Free plan                                   |                  $0.00 |
| Azure Container Apps                         | Consumption, min replicas = 0               |            $0.00–$2.00 |
| Azure Functions                              | Flex Consumption, no always-ready instances |            $0.00–$2.00 |
| Blob Storage, Queue Storage, Terraform state | Low file and queue volume                   |                  $1.50 |
| Event Grid                                   | Low event volume                            |                  $0.50 |
| Azure Key Vault                              | Low secret operations                       |                  $0.50 |
| Application Insights and Log Analytics       | Sampling and daily cap                      |                  $2.00 |
| Small traffic, egress, and usage reserve     | Estimated buffer                            |                  $2.50 |
| **Estimated Monthly Baseline**               |                                             |             **$30.17** |
| **Available Budget Headroom**                |                                             |             **$19.83** |

## 9.2 Excluded From the $50 Estimate

The following are not included:

* Existing Vercel charges during dual-running.
* Existing Supabase charges during migration.
* Domain registration.
* EmailJS, SMTP, Twilio, SendGrid, or SMS costs.
* Stripe fees.
* POS vendor fees.
* QuickBooks fees.
* External AI/OCR inference costs.
* Azure support plan.
* Human engineering and migration labor.
* Temporary UAT environment cost.
* Major data egress.
* Data growth above 32 GiB.
* Blob storage growth above 50 GB.
* High container/API traffic.
* Database scale-up to B2s, B2ms, or General Purpose.

---

# 10. Cost Guardrails

Terraform must enforce cost management.

## 10.1 Mandatory Resource Tags

```text
application = restops
environment = production
owner = platform-engineering
cost_center = startup-saas
terraform_managed = true
data_classification = confidential
service = api | database | storage | functions | frontend
```

## 10.2 Terraform Deny Controls

Terraform policy must deny or require manual approval for:

```text
AKS cluster creation
Azure Front Door Premium
Azure API Management paid tiers
Azure Firewall
Azure Redis Premium
Azure Service Bus Premium
Azure Web PubSub Standard or Premium
PostgreSQL HA
PostgreSQL General Purpose tier
Multi-region deployment
Private Endpoint creation
Public PostgreSQL access
Untagged resources
Production resources created outside Terraform
```

## 10.3 Budget Alerts

Create Azure Cost Management budgets at:

```text
$30 monthly: Engineering early warning
$40 monthly: Founder / architecture review
$45 monthly: Freeze nonessential Azure changes
$50 monthly: Cost incident and approval required
```

Create anomaly alerts at subscription and resource-group scope.

## 10.4 Log Cost Controls

Application Insights must use:

* Sampling enabled.
* Daily ingestion cap.
* Thirty-day default diagnostic retention.
* Ninety-day retention only for required audit data.
* No request-body logging for invoice, payment, or credentials.
* No JWT, password, Stripe payload, or vendor secret logging.
* Error-level and warning-level logs prioritized.
* Large payload logging disabled.

---

# 11. Terraform Architect Handover Responsibilities

## 11.1 Terraform Architect Owns

### Azure Foundation

* Subscription and resource group structure.
* Terraform remote state storage.
* Terraform state locking.
* Managed identity for Terraform deployment.
* GitHub Actions or Azure DevOps OIDC authentication.
* Naming standards.
* Tagging standards.
* Cost budgets.
* Cost anomaly alerts.

### Networking

* One VNet.
* Container Apps subnet.
* Functions integration subnet.
* Delegated PostgreSQL subnet.
* Private PostgreSQL DNS zone.
* VNet links.
* Network security groups where required.
* No public PostgreSQL endpoint.

### Application Platform

* Azure Static Web App.
* Azure Container Apps environment.
* `restops-core-api` Container App.
* Azure Function App on Flex Consumption.
* Azure Container Registry.
* Managed identities.
* Container App custom domain configuration.
* Managed TLS certificate configuration.
* Function app deployment configuration.

### Data and Storage

* PostgreSQL Flexible Server.
* PostgreSQL private networking.
* Blob Storage account.
* Blob containers.
* Queue Storage queues.
* Event Grid subscription.
* Terraform state storage account.
* Blob lifecycle policies.
* Soft delete policies.

### Security and Observability

* Key Vault.
* Key Vault RBAC.
* Managed identity assignments.
* Application Insights.
* Log Analytics workspace.
* Diagnostic settings.
* Alert rules.
* Backup settings.
* Terraform security scanning.

---

## 11.2 Terraform Resource Inventory

```text
Resource Group:
rg-restops-prod-eastus

Networking:
vnet-restops-prod
snet-containerapps
snet-functions
snet-postgresql
privatelink/postgresql private DNS zone

Frontend:
stapp-restops-prod

Runtime:
cae-restops-prod
ca-restops-core-api
func-restops-workers
acrrestopsprod

Data:
pg-restops-prod
strestopsdata
strestopstfstate

Storage Containers:
invoices
invoice-attachments
receipts
avatars
vendor-documents
exports
temporary-uploads
tfstate

Queue Storage:
invoice-processing
invoice-retry
stripe-events
pos-sync
vendor-sync
email-dispatch
outbox-dispatch
dead-letter

Security:
kv-restops-prod
id-restops-api
id-restops-functions

Observability:
appi-restops-prod
log-restops-prod
budget-restops-prod
alerts-restops-prod
```

---

## 11.3 Terraform Repository Structure

```text
terraform/
├── bootstrap/
│   ├── state-storage/
│   ├── deployment-identity/
│   └── key-vault/
│
├── modules/
│   ├── resource-group/
│   ├── network/
│   ├── postgresql/
│   ├── storage/
│   ├── key-vault/
│   ├── container-registry/
│   ├── container-apps/
│   ├── functions/
│   ├── static-web-app/
│   ├── event-grid/
│   ├── monitoring/
│   └── budgets/
│
├── environments/
│   ├── local/
│   ├── migration/
│   └── production/
│
├── policies/
│   ├── deny-premium-resources/
│   ├── require-tags/
│   ├── deny-public-postgresql/
│   └── require-monitoring/
│
└── pipelines/
    ├── terraform-plan.yml
    ├── terraform-apply.yml
    └── drift-detection.yml
```

---

# 12. Migration Architect Handover Responsibilities

## 12.1 Source Extraction

The Migration Architect must capture the current production state before rewriting anything.

Required extraction package:

```text
React source repository
Vercel project configuration
Vercel environment variable inventory
Supabase project inventory
Supabase schema dump
PostgreSQL data dump
RLS policies
Views, triggers, functions, and extensions
Storage bucket manifest
Storage object manifest
Edge Function source code
Edge Function environment variable names
Cron schedules
Realtime subscriptions
Stripe event types
POS webhook event types
Vendor integration endpoints
QuickBooks integration details
Email configuration
OCR and AI configuration
Custom domains
DNS records
Current production test scenarios
Known production issues
```

## 12.2 Authentication Migration

The Migration Architect must define the Entra External ID user-transition process.

Required decisions:

* Password reset migration versus staged onboarding.
* Existing user-to-Entra identity mapping.
* Email verification requirements.
* MFA policy.
* Invitation flow.
* User activation and deactivation process.
* Platform administrator access process.
* Existing session invalidation strategy.
* Customer communication plan.

Do not promise direct password-hash migration until it is technically validated.

The default migration approach is:

```text
Create Entra External ID account
    |
Send customer invitation
    |
User sets new password
    |
Application maps Entra ID to existing internal user record
    |
Existing organization and location memberships remain unchanged
```

## 12.3 Database Migration

The Migration Architect owns:

* Supabase schema extraction.
* PostgreSQL compatibility assessment.
* Migration script refactoring.
* RLS helper-function replacement.
* Trigger migration.
* Stored procedure migration.
* Extension compatibility assessment.
* Data export.
* Data transformation.
* Data import.
* Record-count reconciliation.
* Financial-total reconciliation.
* Tenant-isolation testing.

The migration must validate:

```text
organizations
brands
locations
users
memberships
roles
products
vendors
recipes
inventory
orders
receiving
invoices
payments
labor
accounting
audit_logs
notifications
integration_settings
```

## 12.4 Edge Function Migration

Each Supabase Edge Function must be classified.

| Current Function Type      | Azure Target                             |
| -------------------------- | ---------------------------------------- |
| Stripe webhook             | Azure Function HTTP trigger              |
| POS webhook                | Azure Function HTTP trigger              |
| Vendor webhook             | Azure Function HTTP trigger              |
| Invoice processing         | Blob Event Grid Function + Queue worker  |
| Email invoice processing   | Queue-triggered Function                 |
| SmartPrep cron             | Timer-triggered Function                 |
| Dashboard reports          | Timer-triggered Function                 |
| POS synchronization        | Queue-triggered Function                 |
| Accounting synchronization | Queue-triggered Function                 |
| Invite user                | Core API or Azure Function               |
| Invite client              | Core API                                 |
| Billing worker             | Queue-triggered Function                 |
| AI insights                | Queue-triggered Function or API endpoint |
| Cleanup job                | Timer-triggered Function                 |

The migration architect must create a function-by-function conversion inventory:

```text
Function Name
Current Trigger
Current Inputs
Current Secrets
Current Database Tables
Current Storage Dependencies
Current External Integrations
Azure Target Trigger
Azure Runtime
Idempotency Requirement
Retry Strategy
Dead-Letter Strategy
Test Case
Cutover Status
```

---

# 13. Implementation Plan

## Phase 0: Freeze and Inventory

### Terraform Architect

* Create Terraform repository.
* Create resource naming standards.
* Create tags and cost-policy standards.
* Create Azure subscription and billing alerts.
* Create initial cost dashboard.

### Migration Architect

* Tag the current working production release.
* Export Vercel configuration.
* Export Supabase schema and data.
* Export storage manifest.
* List all Edge Functions.
* List all Supabase SDK calls in React.
* Document current authentication flows.
* Document all webhooks and cron jobs.
* Build regression test inventory.

### Exit Gate

```text
No migration begins until source inventory is complete.
```

---

## Phase 1: Terraform Bootstrap

### Terraform Architect

Provision:

```text
Terraform remote state storage
Terraform deployment managed identity
GitHub Actions or Azure DevOps OIDC
Resource group
Cost budget
Key Vault
Container Registry
Application Insights
Log Analytics
```

### Exit Gate

```text
Terraform plan and apply work through CI/CD.
No secrets exist in Terraform code.
```

---

## Phase 2: Private Data Foundation

### Terraform Architect

Provision:

```text
VNet
Container Apps subnet
Functions subnet
PostgreSQL delegated subnet
Private PostgreSQL DNS zone
Azure PostgreSQL B1ms
Blob Storage
Queue Storage
Event Grid
```

### Migration Architect

* Validate PostgreSQL connectivity.
* Test RLS helper replacement.
* Test database migrations.
* Test schema import.
* Test database restore process.

### Exit Gate

```text
Container Apps and Functions can connect privately to PostgreSQL.
PostgreSQL has no public endpoint.
```

---

## Phase 3: Identity and Authorization Proof

### Terraform Architect

Provision:

```text
Entra External ID application registration
Redirect URIs
Managed identities
Key Vault access assignments
Static Web App
Container Apps environment
Core API deployment slot
```

### Migration Architect

Build:

```text
React MSAL integration
Login and logout
User invitation
User mapping table
Organization membership lookup
Role validation middleware
Location-level authorization
RLS transaction context
Audit event creation
```

### Exit Gate

```text
A ground-staff user cannot access another location.
A location manager cannot access another organization.
A platform admin action is audited.
```

---

## Phase 4: Vertical Slice Proof

The first full Azure workflow must be invoice processing.

### Build

```text
Login
    |
Tenant access validation
    |
Invoice upload authorization
    |
Blob upload
    |
Blob event
    |
Queue processing
    |
OCR / AI processing
    |
PostgreSQL invoice update
    |
Manager approval
    |
Audit event
    |
React polling refresh
```

### Exit Gate

```text
Invoice upload, extraction, approval, and audit trail work end-to-end.
No cross-tenant data exposure is possible.
Retrying the same processing event does not create duplicate data.
```

---

## Phase 5: Domain Migration Waves

### Wave 1: Platform and Tenant Control Plane

```text
Platform Console
Platform Organizations
Platform Plans
Platform Billing
Platform Admins
Platform Audit Logs
Organization Settings
Team Members
Restaurant Setup
```

### Wave 2: Master Data

```text
Products
Vendors
Vendor Items
Recipes
Prepared Items
Organization hierarchy
Feature entitlements
```

### Wave 3: Operational Workflows

```text
Orders
Receiving
Invoice Approval
Transfers
Inventory
Stock Counts
Wastage
AvT Costing
SmartPrep
Commissary
```

### Wave 4: Financial and Workforce Workflows

```text
Payments
Payment History
Reconciliation
Accounting
GL Mapping
Close Books
Labor
Employees
Scheduling
```

### Wave 5: Integrations and Reporting

```text
POS integrations
Vendor sync
QuickBooks sync
Stripe billing
Notifications
Dashboard
Performance
Reports
Mobile App integration
```

### Exit Gate for Every Wave

```text
Functional regression test passed.
Tenant isolation test passed.
Audit test passed.
Failure/retry test passed.
Rollback script documented.
Business owner accepts results.
```

---

# 14. Cutover Plan

## 14.1 Pre-Cutover

```text
Azure functionality is accepted.
All priority workflows are tested.
Database migration rehearsal succeeds.
Storage migration rehearsal succeeds.
User identity migration plan is approved.
Webhook update plan is approved.
DNS records are ready.
Rollback plan is tested.
Cost dashboard is monitored.
```

## 14.2 Cutover Sequence

```text
1. Announce maintenance window.
2. Stop nonessential writes in Vercel + Supabase.
3. Run final PostgreSQL data export.
4. Run final PostgreSQL import into Azure.
5. Run reconciliation checks.
6. Copy final storage delta to Blob Storage.
7. Validate object counts and file hashes.
8. Switch Stripe/POS/vendor webhooks to Azure Function endpoints.
9. Update application environment configuration.
10. Switch app domain DNS from Vercel to Azure Static Web Apps.
11. Switch API domain DNS to Azure Container Apps.
12. Run production smoke tests.
13. Monitor errors, queues, database health, and cost.
14. Keep Vercel and Supabase available for rollback during the agreed rollback window.
```

## 14.3 Rollback Conditions

Rollback if any of these occur:

```text
Cross-tenant data visibility issue
Payment duplicate-processing issue
Invoice upload failure rate exceeds threshold
Database migration reconciliation fails
Critical user login failures
Order or inventory workflow corruption
Stripe webhook validation failure
Major POS synchronization failure
Database instability
Unexpected cost spike exceeding budget control
```

---

# 15. Production Readiness Checklist

## Security

```text
Entra authentication enabled
MFA policy defined
No direct browser-to-database access
PostgreSQL private access enabled
TLS enforced
Key Vault secrets configured
Managed identities configured
Anonymous Blob access disabled
Signed upload URLs expire quickly
RLS test suite passed
Audit logging enabled
```

## Reliability

```text
PostgreSQL backup validated
Restore drill completed
Blob soft delete enabled
Queue retries tested
Poison queue tested
Invoice processing retry tested
Stripe duplicate webhook test passed
POS duplicate event test passed
Terraform state recovery tested
```

## Cost

```text
Monthly budget set to $45
Cost alert at $30
Cost alert at $40
Cost alert at $45
Application Insights cap set
Storage lifecycle policy set
No Premium Azure SKU deployed
No AKS deployed
No permanent UAT environment deployed
```

## Operations

```text
Health endpoint exists
Application Insights dashboard exists
Database CPU alert exists
Database storage alert exists
Queue depth alert exists
Function failure alert exists
Invoice failure alert exists
Payment failure alert exists
On-call owner assigned
Rollback owner assigned
```

---

# 16. Upgrade Triggers

The architecture must be upgraded when one or more of these occur.

| Trigger                                            | Required Upgrade                               |
| -------------------------------------------------- | ---------------------------------------------- |
| Sustained database CPU pressure                    | Upgrade B1ms to B2s or General Purpose         |
| Database credits are repeatedly exhausted          | Upgrade PostgreSQL tier                        |
| More than 50 GB document storage                   | Add Blob lifecycle and storage review          |
| More than 500 active users                         | Reassess Container Apps scaling and monitoring |
| API cold starts impact user operations             | Set minimum replica to 1 and revise budget     |
| Payment or inventory downtime becomes unacceptable | Add PostgreSQL HA                              |
| Customer requires WAF                              | Add Front Door Standard or Premium             |
| Customer requires private-origin access            | Add Front Door Premium and private endpoints   |
| Partner API program launches                       | Add API Management                             |
| High-volume async processing appears               | Upgrade Queue Storage to Service Bus           |
| Realtime becomes operationally critical            | Add Azure Web PubSub                           |
| Multiple major customers require hard isolation    | Add dedicated tenant environments              |
| Revenue supports enterprise operations             | Build Dev, UAT, and Production separately      |

---

# 17. Final Architecture Position

This architecture is the approved low-cost handover baseline.

```text
One Azure region
One shared multi-tenant database
One modular backend API
One Function App
One Blob Storage account
One Queue Storage implementation
One PostgreSQL B1ms server
One Container Registry
One Static Web App
No AKS
No Front Door
No API Management
No Redis
No Service Bus
No Web PubSub
No HA
No permanent UAT
```

The permanent Azure baseline should remain close to:

```text
$30/month expected operating cost
$45/month operating warning threshold
$50/month maximum target ceiling
```

The platform is intentionally designed to grow into a stronger enterprise architecture later, without forcing enterprise cost before the business has enterprise revenue.