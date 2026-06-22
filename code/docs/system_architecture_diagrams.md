# Restops360 System Architecture & Topology

This document provides high-level architectural flows for the Restops360 ecosystem using Mermaid.js.

## 1. High-Level Entity Relationship Diagram (ERD)
This diagram illustrates the core multi-tenant structure mapping Organizations to Locations, and the isolation of Inventory and Sales.

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ LOCATIONS : "owns"
    ORGANIZATIONS ||--o{ USERS : "employs"
    ORGANIZATIONS ||--o{ GLOBAL_ITEMS : "defines"
    LOCATIONS ||--o{ LOCATION_INVENTORY : "tracks"
    GLOBAL_ITEMS ||--o{ LOCATION_INVENTORY : "maps to"
    LOCATIONS ||--o{ SALES_TICKETS : "generates"
    ORGANIZATIONS ||--o{ VENDORS : "contracts"
```

## 2. IoT Webhook Flow (Temperature Probes)
How physical hardware communicates with the Restops360 cloud via Edge Functions.

```mermaid
sequenceDiagram
    participant Probe as Bluetooth Temp Probe
    participant Edge as iot-webhook (Edge Function)
    participant DB as Supabase DB (temperature_logs)
    participant RLS as Row Level Security
    participant UI as React PWA

    Probe->>Edge: POST /iot-webhook {temp: 39F}
    Edge->>DB: Insert into temperature_logs
    DB-->>RLS: Validate payload org_id
    DB-->>Edge: Success
    Edge-->>Probe: 200 OK
    DB-->>UI: Realtime Subscription Update
```

## 3. Automated Franchise Royalty Engine
How the cron-triggered Edge Function calculates billing periods and issues invoices.

```mermaid
graph TD
    A[pg_cron Trigger] -->|Every 1st of Month| B(calculate-royalties Edge Function)
    B --> C{Fetch Active Agreements}
    C --> D[Loop Franchisees]
    D --> E[Aggregate Gross Sales]
    E --> F[Calculate % Royalty]
    F --> G[Generate Stripe Invoice payload]
    G --> H[Insert into franchise_invoices]
    H --> I[Send Email via Resend]
```

## 4. Deep Offline Sync (PWA Resilience)
How the kitchen tablet survives network outages.

```mermaid
sequenceDiagram
    participant User as Prep Cook
    participant Hook as useOfflineSync()
    participant IDB as IndexedDB (Browser)
    participant Cloud as Supabase API

    User->>Hook: Clicks "Punch In"
    Note over Hook: navigator.onLine is FALSE
    Hook->>IDB: queueOfflineMutation('time_clocks/insert', payload)
    Hook-->>User: Toast "Saved Locally"
    
    Note over Hook: Internet Restored
    Hook->>Hook: window.dispatchEvent('online')
    Hook->>IDB: getPendingMutations()
    IDB-->>Hook: Return Array
    Hook->>Cloud: Execute queued API calls
    Cloud-->>Hook: 200 OK
    Hook->>IDB: clearMutation(id)
```

## 5. Billing & Subscription Lifecycle
Handling SaaS monetization securely.

```mermaid
graph LR
    A[Org Owner clicks Upgrade] --> B[create-checkout-session Edge Function]
    B --> C[Stripe Checkout]
    C -->|Success| D[stripe-webhook Edge Function]
    D --> E[Update Organization plan_id]
    E --> F[Unlock Premium Features via RLS]
```
