# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: invoices.spec.js >> Invoices Workflow (Section 7) >> UI enforces authentication before accessing Invoices
- Location: tests\e2e\invoices.spec.js:8:3

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - navigation [ref=e7]:
      - generic [ref=e9]:
        - img "Platform Name" [ref=e12]
        - generic [ref=e13]:
          - link "Infrastructure" [ref=e14] [cursor=pointer]:
            - /url: "#features"
          - link "Telemetry" [ref=e15] [cursor=pointer]:
            - /url: "#showcase"
          - link "Pricing" [ref=e16] [cursor=pointer]:
            - /url: "#pricing"
          - button "Log in" [ref=e18] [cursor=pointer]
          - button "BOOK DEMO" [ref=e20] [cursor=pointer]
    - generic [ref=e23]:
      - generic [ref=e24]:
        - img [ref=e25]
        - text: Intelligence Orchestration
      - heading "Building technical kitchens." [level=1] [ref=e27]:
        - generic [ref=e28]: Building
        - generic [ref=e29]: technical
        - generic [ref=e30]: kitchens.
      - paragraph [ref=e31]: Restops delivers automated logistics, AI-driven inventory telemetry, and sovereign infrastructure for the modern hospitality enterprise.
      - generic [ref=e32]:
        - button "REQUEST ACCESS" [ref=e34] [cursor=pointer]:
          - text: REQUEST ACCESS
          - img
        - link "VIEW DOCUMENTATION" [ref=e35] [cursor=pointer]:
          - /url: /docs
          - text: VIEW DOCUMENTATION
    - generic [ref=e36]:
      - generic [ref=e39]:
        - generic [ref=e40]:
          - generic [ref=e41]: 99.9%
          - generic [ref=e42]: Sync Fidelity
        - generic [ref=e43]:
          - generic [ref=e44]: 0.8ms
          - generic [ref=e45]: Latency Delta
        - generic [ref=e46]:
          - generic [ref=e47]: 150+
          - generic [ref=e48]: Global Nodes
        - generic [ref=e49]:
          - generic [ref=e50]: 24/7
          - generic [ref=e51]: Uptime Metric
      - generic [ref=e54]:
        - generic [ref=e55]:
          - generic [ref=e56]: Edge Logics
          - heading "Decentralized Kitchen Ops." [level=2] [ref=e57]:
            - text: Decentralized
            - text: Kitchen Ops.
          - paragraph [ref=e58]: Our vision-driven interface allows your frontline staff to synchronize physical logistics with high-fidelity digital audits instantly.
          - generic [ref=e59]:
            - generic [ref=e60]:
              - generic [ref=e61]:
                - img [ref=e62]
                - heading "Low-latency OCR" [level=4] [ref=e65]
              - paragraph [ref=e66]: Sub-second extraction.
            - generic [ref=e67]:
              - generic [ref=e68]:
                - img [ref=e69]
                - heading "State Persistence" [level=4] [ref=e72]
              - paragraph [ref=e73]: Offline-first buffers.
        - img "Interface" [ref=e78]
      - generic [ref=e80]:
        - generic [ref=e81]:
          - heading "Infrastructure Modules" [level=2] [ref=e82]
          - paragraph [ref=e83]: Completely modular, enterprise-grade systems designed to automate the manual toil of restaurant management.
        - generic [ref=e84]:
          - generic [ref=e88]:
            - img [ref=e90]
            - heading "Extraction" [level=3] [ref=e92]
            - paragraph [ref=e93]: Transform paper into structured JSON entities via multi-modal analysis.
          - generic [ref=e97]:
            - img [ref=e99]
            - heading "Telemetry" [level=3] [ref=e101]
            - paragraph [ref=e102]: Real-time observability into replenishment thresholds.
          - generic [ref=e106]:
            - img [ref=e108]
            - heading "Identity" [level=3] [ref=e111]
            - paragraph [ref=e112]: Granular RBAC and audit logging for every single action.
          - generic [ref=e116]:
            - img [ref=e118]
            - heading "Lifecycle" [level=3] [ref=e121]
            - paragraph [ref=e122]: Automated reconciliation between demand and logistics.
          - generic [ref=e126]:
            - img [ref=e128]
            - heading "Orchestration" [level=3] [ref=e132]
            - paragraph [ref=e133]: Centralized command for multi-unit ghost kitchen networks.
          - generic [ref=e137]:
            - img [ref=e139]
            - heading "Intelligence" [level=3] [ref=e141]
            - paragraph [ref=e142]: ML-driven delta analysis to optimize procurement costs.
      - generic [ref=e144]:
        - generic [ref=e145]:
          - heading "Licensing" [level=2] [ref=e146]
          - paragraph [ref=e147]: Select your tier
        - generic [ref=e151]:
          - generic [ref=e152]: Private Beta
          - generic [ref=e153]:
            - heading "Platform Complete" [level=3] [ref=e154]
            - generic [ref=e155]:
              - generic [ref=e156]: $149
              - generic [ref=e157]: / Mo
          - list [ref=e158]:
            - listitem [ref=e159]:
              - img [ref=e160]
              - text: Unlimited visual extractions
            - listitem [ref=e163]:
              - img [ref=e164]
              - text: Universal user access
            - listitem [ref=e167]:
              - img [ref=e168]
              - text: Full-stack telemetry
            - listitem [ref=e171]:
              - img [ref=e172]
              - text: Dedicated API instance
            - listitem [ref=e175]:
              - img [ref=e176]
              - text: 24/7 technical escort
          - button "JOIN WAITLIST" [ref=e180] [cursor=pointer]
      - contentinfo [ref=e181]:
        - generic [ref=e183]:
          - img "Platform Name" [ref=e186]
          - paragraph [ref=e187]: © 2026 RESTOPS INC. BUILT FOR SCALE.
          - generic [ref=e188]:
            - link "Privacy" [ref=e189] [cursor=pointer]:
              - /url: /privacy
            - link "Terms" [ref=e190] [cursor=pointer]:
              - /url: /terms
  - region "Notifications alt+T"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Invoices Workflow (Section 7)', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/Invoices');
  6  |   });
  7  | 
  8  |   test('UI enforces authentication before accessing Invoices', async ({ page }) => {
  9  |     // Wait for network idle
  10 |     await page.waitForLoadState('networkidle');
  11 | 
  12 |     // Without a valid admin token, the app should bounce us to the login page.
  13 |     const isLogin = await page.locator('text=Welcome to EdgeOps').count() > 0;
  14 |     const isUnauthorized = await page.locator('text=Unauthorized').count() > 0;
  15 |     
> 16 |     expect(isLogin || isUnauthorized).toBeTruthy();
     |                                       ^ Error: expect(received).toBeTruthy()
  17 |   });
  18 | });
  19 | 
```