# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.spec.js >> Dashboard Workflows (Section 5) >> Dashboard prevents unauthenticated data loading
- Location: tests\e2e\dashboard.spec.js:8:3

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - navigation [ref=e4]:
      - generic [ref=e6]:
        - generic [ref=e7]:
          - img [ref=e9]:
            - generic [ref=e32]: E
          - generic [ref=e33]:
            - generic [ref=e34]: EdgeOps
            - generic [ref=e35]: Restaurant Operations Platform
        - generic [ref=e36]:
          - link "Infrastructure" [ref=e37] [cursor=pointer]:
            - /url: "#features"
          - link "Telemetry" [ref=e38] [cursor=pointer]:
            - /url: "#showcase"
          - link "Pricing" [ref=e39] [cursor=pointer]:
            - /url: "#pricing"
          - button "Log in" [ref=e41] [cursor=pointer]
          - button "BOOK DEMO" [ref=e42] [cursor=pointer]
    - generic [ref=e45]:
      - generic [ref=e46]:
        - img [ref=e47]
        - text: Intelligence Orchestration
      - heading "Building technical kitchens." [level=1] [ref=e49]:
        - text: Building
        - text: technical
        - text: kitchens.
      - paragraph [ref=e50]: EdgeOps delivers automated logistics, AI-driven inventory telemetry, and sovereign infrastructure for the modern hospitality enterprise.
      - generic [ref=e51]:
        - button "REQUEST ACCESS" [ref=e52] [cursor=pointer]:
          - text: REQUEST ACCESS
          - img
        - link "VIEW DOCUMENTATION" [ref=e53] [cursor=pointer]:
          - /url: /docs
          - button "VIEW DOCUMENTATION" [ref=e54]
    - generic [ref=e57]:
      - generic [ref=e58]:
        - generic [ref=e59]: 99.9%
        - generic [ref=e60]: Sync Fidelity
      - generic [ref=e61]:
        - generic [ref=e62]: 0.8ms
        - generic [ref=e63]: Latency Delta
      - generic [ref=e64]:
        - generic [ref=e65]: 150+
        - generic [ref=e66]: Global Nodes
      - generic [ref=e67]:
        - generic [ref=e68]: 24/7
        - generic [ref=e69]: Uptime Metric
    - generic [ref=e70]:
      - generic [ref=e73]:
        - generic [ref=e74]:
          - generic [ref=e75]: Edge Logics
          - heading "Decentralized Kitchen Ops." [level=2] [ref=e76]:
            - text: Decentralized
            - text: Kitchen Ops.
          - paragraph [ref=e77]: Our vision-driven interface allows your frontline staff to synchronize physical logistics with high-fidelity digital audits instantly.
          - generic [ref=e78]:
            - generic [ref=e79]:
              - generic [ref=e80]:
                - img [ref=e81]
                - heading "Low-latency OCR" [level=4] [ref=e84]
              - paragraph [ref=e85]: Sub-second extraction.
            - generic [ref=e86]:
              - generic [ref=e87]:
                - img [ref=e88]
                - heading "State Persistence" [level=4] [ref=e91]
              - paragraph [ref=e92]: Offline-first buffers.
        - img "Interface" [ref=e95]
      - generic [ref=e98]:
        - heading "Infrastructure Modules" [level=2] [ref=e100]
        - generic [ref=e102]:
          - generic [ref=e103]:
            - img [ref=e105]
            - heading "Extraction" [level=3] [ref=e107]
            - paragraph [ref=e108]: Transform paper into structured JSON entities via multi-modal analysis.
          - generic [ref=e111]:
            - img [ref=e113]
            - heading "Telemetry" [level=3] [ref=e115]
            - paragraph [ref=e116]: Real-time observability into replenishment thresholds.
          - generic [ref=e119]:
            - img [ref=e121]
            - heading "Identity" [level=3] [ref=e124]
            - paragraph [ref=e125]: Granular RBAC and audit logging for every single action.
          - generic [ref=e128]:
            - img [ref=e130]
            - heading "Lifecycle" [level=3] [ref=e133]
            - paragraph [ref=e134]: Automated reconciliation between demand and logistics.
          - generic [ref=e137]:
            - img [ref=e139]
            - heading "Orchestration" [level=3] [ref=e143]
            - paragraph [ref=e144]: Centralized command for multi-unit ghost kitchen networks.
          - generic [ref=e147]:
            - img [ref=e149]
            - heading "Intelligence" [level=3] [ref=e151]
            - paragraph [ref=e152]: ML-driven delta analysis to optimize procurement costs.
      - generic [ref=e156]:
        - generic [ref=e157]:
          - heading "Licensing" [level=2] [ref=e158]
          - paragraph [ref=e159]: Select your tier
        - generic [ref=e161]:
          - generic [ref=e162]: Private Beta
          - generic [ref=e163]:
            - heading "Platform Complete" [level=3] [ref=e164]
            - generic [ref=e165]:
              - generic [ref=e166]: $149
              - generic [ref=e167]: USD / Mo
          - list [ref=e168]:
            - listitem [ref=e169]: Unlimited visual extractions
            - listitem [ref=e171]: Universal user access
            - listitem [ref=e173]: Full-stack telemetry
            - listitem [ref=e175]: Dedicated API instance
            - listitem [ref=e177]: 24/7 technical escort
          - button "JOIN WAITLIST" [ref=e179] [cursor=pointer]
    - contentinfo [ref=e180]:
      - generic [ref=e181]:
        - generic [ref=e182]:
          - generic [ref=e183]:
            - generic [ref=e185]:
              - img [ref=e187]:
                - generic [ref=e210]: E
              - generic [ref=e211]:
                - generic [ref=e212]: EdgeOps
                - generic [ref=e213]: Restaurant Operations Platform
            - paragraph [ref=e214]: Sovereign infrastructure for high-performance hospitality logistics and telemetry.
          - generic [ref=e215]:
            - heading "Systems" [level=5] [ref=e216]
            - list [ref=e217]:
              - listitem [ref=e218]:
                - link "Core Nodes" [ref=e219] [cursor=pointer]:
                  - /url: "#features"
              - listitem [ref=e220]:
                - link "Security" [ref=e221] [cursor=pointer]:
                  - /url: "#"
          - generic [ref=e222]:
            - heading "Resources" [level=5] [ref=e223]
            - list [ref=e224]:
              - listitem [ref=e225]:
                - link "API Docs" [ref=e226] [cursor=pointer]:
                  - /url: "#"
              - listitem [ref=e227]:
                - link "Support" [ref=e228] [cursor=pointer]:
                  - /url: "#"
        - generic [ref=e229]:
          - paragraph [ref=e230]: © 2026 EDGEOPS INC. BUILT FOR SCALE.
          - generic [ref=e231]:
            - link "Privacy" [ref=e232] [cursor=pointer]:
              - /url: /privacy
            - link "Terms" [ref=e233] [cursor=pointer]:
              - /url: /terms
            - link "Cookies" [ref=e234] [cursor=pointer]:
              - /url: /cookies
  - region "Notifications alt+T"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Dashboard Workflows (Section 5)', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/Dashboard');
  6  |   });
  7  | 
  8  |   test('Dashboard prevents unauthenticated data loading', async ({ page }) => {
  9  |     await page.waitForLoadState('networkidle');
  10 | 
  11 |     const isLogin = await page.locator('text=Sign in to EdgeOps').count() > 0;
  12 |     const isUnauthorized = await page.locator('text=Unauthorized').count() > 0;
  13 |     
> 14 |     expect(isLogin || isUnauthorized).toBeTruthy();
     |                                       ^ Error: expect(received).toBeTruthy()
  15 |     
  16 |     // Ensure no sensitive data elements load
  17 |     const revenueCard = page.locator('text=Total Revenue');
  18 |     await expect(revenueCard).toHaveCount(0);
  19 |   });
  20 | });
  21 | 
```