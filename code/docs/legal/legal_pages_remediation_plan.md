# Public Legal Pages — Remediation Plan

**Prepared:** July 25, 2026
**Status:** Draft for review. Describes proposed changes only — nothing listed here has been
applied yet.
**Scope:** All 18 live public routes (`/docs` plus the 17 legal/policy pages), reviewed
page-by-page against the current repository state.
**Companion documents:** [restops_360_legal_launch_checklist.md](restops_360_legal_launch_checklist.md)
(the current, authoritative decision log), [platform_legal_privacy_inventory_draft.md](../platform_legal_privacy_inventory_draft.md)
(older, confirmed stale in places — see the Decisions section below).

> Internal planning document, not legal advice and not a substitute for the licensed U.S.
> SaaS/technology counsel review that `restops_360_legal_launch_checklist.md` itself calls for.

## Purpose

A full review of all 18 public routes found that 9 pages — Terms of Service, Privacy Policy,
Cookie Policy, Acceptable Use Policy, Security Policy, Data Processing Addendum, Service Level
Agreement, Subprocessor List, SMS Terms and Conditions — are current, internally consistent,
and share one resolved legal identity throughout. The other 9 (6 legacy policy pages, 2 pages
nobody had reviewed before, and the site footer/docs page) are still running on a
pre-resolution draft. This document lists exactly what's wrong on each one, what the fix would
be, and **why it matters**, so items can be approved individually rather than as an
all-or-nothing batch.

## Status legend

| Tag | Meaning |
|---|---|
| **READY** | Mechanical fix. The correct value already exists elsewhere in the repo; no new decision needed. |
| **NEEDS YOUR INPUT** | Cannot be safely filled in without a decision only you can make. |
| **SUGGESTED** | Not broken as such, but a real improvement; involves a small judgment call, described below for approval. |
| **OPTIONAL / LARGER** | A bigger, structural change. Worth knowing about; not required to fix the items above. |

## Reference values used throughout this plan

Already established and consistent across the 9 current documents — every "READY" fix below
just copies one of these into a page that never got updated:

- **Legal entity:** Mindful Tech Solutions Inc., doing business as RestOps-360
- **Address:** 224 S Peters Road, Knoxville, Tennessee 37923, United States
- **Contact email:** `contact@mindfultechsol.com`
- **Phone:** +1 (865) 666-7690
- **Governing law / venue:** Tennessee law; Knox County, Tennessee courts
- **Breach cure period:** 30 days (Terms of Service §6)

## Applies to all 8 legacy pages below

Three issues repeat identically across `VendorPortalTerms.jsx`, `AIFeaturesAddendum.jsx`,
`OpenSourceNotices.jsx`, `CCPAPrivacyRights.jsx`, `MasterSubscriptionAgreement.jsx`,
`AccessibilityStatement.jsx`, `AIUsagePolicy.jsx`, and `DataRetentionPolicy.jsx`:

| # | Current | Proposed | Why it matters | Status |
|---|---|---|---|---|
| G1 | Nav bar reads "Restops Platform" | "RestOps-360" — the resolved product name used everywhere else | A live page showing a different, non-committal name than the brand named in the contract text it's part of reads as unfinished and can create doubt about whether "Restops Platform" and "RestOps-360" are even the same offering | SUGGESTED |
| G2 | Header shows only "Last updated: July 24, 2026" | Add "Effective date: July 24, 2026" above it, matching the 9 canonical docs | "Last updated" alone doesn't establish when the terms actually became effective against a reader — the other 9 documents treat this as a required field for that reason | SUGGESTED |
| G3 | No entity/address/phone contact block, or an incomplete one | Add the standard block (see Reference values above) | A legal page with no way to identify or contact the party behind it looks unfinished and undermines its own notices/enforcement provisions, which typically depend on a working contact address | SUGGESTED |

Everything below is specific to each individual page, on top of the three shared items above.

## 1. Master Subscription Agreement — `/msa`

**File:** `src/modules/public/pages/MasterSubscriptionAgreement.jsx`

| Location | Current | Proposed | Why it matters | Status |
|---|---|---|---|---|
| §1 | `[LEGAL ENTITY NAME]` | Mindful Tech Solutions Inc. | A contract that doesn't name one of its own two parties is arguably not a valid, enforceable agreement at all — this is the most basic requirement of contract formation | READY |
| §6 | `[RENEWAL NOTICE PERIOD TBD]` | No existing value to copy — pick 30 / 60 / 90 days | Without a stated number the auto-renewal clause is effectively unenforceable: neither party can know when notice must be given to stop a renewal | NEEDS YOUR INPUT |
| §7 | `[CURE PERIOD TBD]`-day cure period | 30 days, identical to Terms of Service §6 | An undefined cure period leaves a material, negotiated term blank — neither side knows how long they have to fix a breach before the other can terminate | READY |
| §9 | Governed by `[GOVERNING STATE]`, venue `[VENUE]` | Tennessee; Knox County, Tennessee, identical to Terms of Service §19 | Without an agreed forum, a dispute has no settled venue, which raises litigation cost and risks a court defaulting to a less favorable state's law | READY |
| §10 | `[Signature block placeholder — Customer legal entity name, signatory name and title, date; Restops signatory name and title, date.]` | Likely fine as-is | This document is explicitly "a negotiated-deal template, not a click-through page," so a labeled placeholder for deal-specific signature details is probably intentional, not forgotten — but it looks identical to the real gaps above at a glance, so it's worth an explicit confirmation rather than assuming | NEEDS YOUR CONFIRMATION |

This is the highest-visibility of the six pages below — it's what gets shown to negotiated
enterprise deals, exactly the customers most likely to have their own counsel read it closely.

## 2. Vendor Portal Terms — `/vendor-terms`

**File:** `src/modules/public/pages/VendorPortalTerms.jsx`

| Location | Current | Proposed | Why it matters | Status |
|---|---|---|---|---|
| §5 | `[PRIVACY CONTACT EMAIL]` | contact@mindfultechsol.com | A vendor told to contact a literal placeholder string has no real way to exercise the right this section describes (disputing an unauthorized entry made on their behalf) | READY |
| §9 | `[PRIVACY CONTACT EMAIL]` | contact@mindfultechsol.com | Same problem, for a vendor's data-access/correction/deletion request | READY |
| §11 | `[SUPPORT CONTACT EMAIL]`, `[PRIVACY CONTACT EMAIL]` | contact@mindfultechsol.com (both) | This is the page's own dedicated "Contact" section — publishing it with non-functional addresses defeats its purpose | READY |

## 3. AI Features Addendum — `/ai-terms`

**File:** `src/modules/public/pages/AIFeaturesAddendum.jsx`

| Location | Current | Proposed | Why it matters | Status |
|---|---|---|---|---|
| §9 | `[SUPPORT CONTACT EMAIL]` | contact@mindfultechsol.com | Same as above — a placeholder contact address is a dead end for anyone trying to reach you about an AI feature | READY |

No other issues found on this page — the beta/experimental framing, human-review requirement,
and no-training disclosure are all well drafted already.

## 4. Open Source & Third-Party Notices — `/open-source`

**File:** `src/modules/public/pages/OpenSourceNotices.jsx`

| Location | Current | Proposed | Why it matters | Status |
|---|---|---|---|---|
| §4 | `[LEGAL CONTACT EMAIL]` | contact@mindfultechsol.com | Same non-functional-contact problem as the other pages above | READY |
| §6 | `[LEGAL CONTACT EMAIL]` | contact@mindfultechsol.com | Same | READY |
| §3 | react-leaflet / @react-leaflet/core under Hippocratic-2.1, an ethical-source, non-OSI license — "has not been assessed here beyond flagging it" | Decide: get counsel sign-off that it's acceptable, replace the mapping library, or knowingly accept the flagged risk for now | This is a live, unresolved legal question, not a formatting gap — the page itself admits nobody has actually determined whether using this dependency is fine, and an enterprise customer's security/legal questionnaire may specifically ask about non-OSI licenses | NEEDS YOUR INPUT |

The license-summary table and self-generated-scan disclaimer are good as-is — no change needed.

## 5. CCPA Notice & Privacy Choices — `/ccpa-privacy-rights`

**File:** `src/modules/public/pages/CCPAPrivacyRights.jsx`

| Location | Current | Proposed | Why it matters | Status |
|---|---|---|---|---|
| §5 | `[PRIVACY CONTACT EMAIL]` | contact@mindfultechsol.com | A California resident trying to exercise a statutory privacy right hits a placeholder instead of a working address | READY |
| §5 | Literal internal note rendered as page text: *"[Authorized-agent submission process to be finalized before production launch.]"* | Replace with an actual described process, e.g.: "An authorized agent may submit a request on your behalf if they provide signed permission from you; we may still contact you directly to verify your identity and confirm the request." (draft only — needs sign-off) | CCPA/CPRA expects this process to actually be described in a notice-at-collection page, not flagged as pending — publishing a page that visibly admits it's incomplete undercuts the notice's own purpose and could itself be read as evidence the notice is inadequate | NEEDS YOUR INPUT |

## 6. Accessibility Statement — `/accessibility`

**File:** `src/modules/public/pages/AccessibilityStatement.jsx`

| Location | Current | Proposed | Why it matters | Status |
|---|---|---|---|---|
| §5 | `[SUPPORT CONTACT EMAIL]` | contact@mindfultechsol.com | Someone reporting an accessibility barrier — often already dealing with a barrier to begin with — hits a placeholder instead of a working contact | READY |

Content is otherwise good — honest about scope, describes a real scan that was actually run,
discloses real remaining limitations. No other changes recommended.

## 7. AI Usage Policy — `/ai-usage`

**File:** `src/modules/public/pages/AIUsagePolicy.jsx` — no bracket placeholders, but three
sentences read as internal drafting notes rather than customer-facing policy. Nobody reviewed
this page before this pass (it isn't tracked in either companion document).

| Location | Current | Proposed | Why it matters | Status |
|---|---|---|---|---|
| §1 | "The exact Azure deployment name and public model label must be verified against the production Azure resource before publication." | Drop the specific model name/version claim rather than publish an unverified one — state "Azure OpenAI" generically | Telling a customer "we haven't verified this yet" in a live policy is worse than simply not naming the model — it invites the obvious question of why it's published, and if the named model turns out wrong the whole page needs republishing anyway | SUGGESTED |
| §2 | "AI Assistant and chatbot classification as production or beta/experimental remains a product/legal decision before launch." | Either commit to a classification now, or remove the sentence and let AI Features Addendum §2 (which already handles the beta/experimental case cleanly) cover it | This sentence describes a decision-in-progress instead of stating a rule — a customer reading it can't actually tell whether these features carry support/reliability commitments, which is the entire point of the disclosure | NEEDS YOUR INPUT |
| §5 | "If AI Assistant or chatbot features are classified as beta or experimental, additional limitations... must be published before enablement." | Same as above — resolve or remove | Same reason — an unresolved conditional statement isn't a disclosure a customer can rely on | NEEDS YOUR INPUT |

## 8. Data Retention Policy — `/data-retention`

**File:** `src/modules/public/pages/DataRetentionPolicy.jsx` — also never reviewed before this
pass.

| Location | Current | Proposed | Why it matters | Status |
|---|---|---|---|---|
| §5 | "Final operational procedures are documented in the production readiness runbooks." | Remove the internal-runbook reference. Either expand this page to match the real numbers already stated in Privacy Policy §10, or trim it to a short pointer to `/privacy#retention` so there's one retention statement instead of two | A customer can't see your internal runbooks, so from their side the retention policy has no actual content at that point. It also creates a live inconsistency risk: two public pages describing the same topic (this one and Privacy Policy §10) with different levels of detail and no cross-reference between them | NEEDS YOUR INPUT (pick a direction) |

## 9. Site footer — `LandingPage.jsx`

A literal backslash instead of a forward slash breaks 7 of the footer's legal-page links:

| Current | Proposed |
|---|---|
| `to="\subprocessors"` (line 451) | `to="/subprocessors"` |
| `to="\dpa"` (line 466) | `to="/dpa"` |
| `to="\sla"` (line 467) | `to="/sla"` |
| `to="\ai-usage"` (line 470) | `to="/ai-usage"` |
| `to="\data-retention"` (line 471) | `to="/data-retention"` |
| `to="\sms-terms"` (line 482) | `to="/sms-terms"` |
| `to="\cookies"` (line 483) | `to="/cookies"` |

**Why it matters:** React Router doesn't resolve a leading-backslash string to the registered
`/subprocessors`-style route, so these links are simply dead clicks — but the consequence here
is bigger than a UX nit. `website_sms_compliance_implementation.md` requires these exact footer
links to be live and demonstrable before Azure toll-free SMS carrier verification can even be
submitted, so this bug is currently blocking a real launch dependency, not just cosmetics.

**Status: READY.**

## 10. Architecture Docs page — `/docs`

**File:** `src/modules/public/pages/Documentation.jsx`, line 295

| Current | Proposed | Why it matters | Status |
|---|---|---|---|
| "© 2026 RESTOPS INC. ARCHITECTURE DOCS." | "© 2026 Mindful Tech Solutions Inc." — matches the already-corrected `LandingPage.jsx` footer | A copyright notice under a name ("RestOps Inc.") that doesn't match the actual contracting entity named in every legal document ("Mindful Tech Solutions Inc.") is confusing at best, and at worst reads as if a different, unrelated entity owns the page | READY |

Separately noticed, outside the scope of this legal-pages review but in the same file: the
demo-request modal has no privacy-policy link near the form, and collects a `phone` field in
component state with no actual input rendered for it, so it is always submitted empty.

## Cross-cutting structural options (optional, larger scope)

Not required to fix the items above, but each addresses the actual root cause behind most of
the "READY" items in this document:

- **Centralize shared identity fields.** One constants module (entity name, address, emails,
  phone) imported by every legal page, instead of the same literal strings duplicated across
  15+ files. *Why it matters:* almost every READY fix above exists because a fact changed once
  (the entity name/contact resolution) and the update didn't propagate to every file that
  needed it — a shared constant makes the next such change atomic instead of manual-per-file.
- **Migrate the remaining 6 legacy pages to the `LegalMarkdownPage` + `.md` pattern**, matching
  the 9 pages already migrated. *Why it matters:* each of these 6 currently exists as two
  copies (a `.md` mirror and a `.jsx` page) that have already diverged once before, per
  `CLAUDE.md` — that's the exact mechanism that produced today's placeholder problem, and it
  will keep producing it until there's only one copy to edit.
- **Reconcile `platform_legal_privacy_inventory_draft.md`** with current reality, or mark it
  explicitly superseded by `restops_360_legal_launch_checklist.md`. *Why it matters:* that file
  still describes cancellation as requiring three months' written notice and nonpayment
  suspension after 10 days, while the live Terms of Service §6 already says something simpler
  and different (cancel anytime, effective at the end of the current billing period;
  "reasonable notice" for nonpayment, no fixed day-count). A second, contradicting tracking
  document risks someone redoing already-finished work, or trusting a stale commercial term
  that no longer matches what's actually live.

## Decisions needed from you (consolidated)

1. MSA renewal notice period — 30 / 60 / 90 days?
2. MSA signature-block bracket — confirm it's an intentional template placeholder, not a
   forgotten value.
3. Hippocratic-2.1 license (react-leaflet) — counsel sign-off, swap the library, or accept the
   flagged risk for now?
4. CCPA authorized-agent process wording — approve the draft above, or provide different
   wording?
5. AI Usage Policy — commit to a beta/production classification for the AI Assistant/chatbot
   now, or leave that decision entirely to the AI Features Addendum?
6. Data Retention Policy — expand it to match Privacy Policy §10, or trim it to a pointer?
7. Registered office suite number (Suite 111 or Suite 211) — flagged as unconfirmed in your own
   launch checklist.
8. Contact-email strategy — keep the single shared inbox, or start splitting into
   privacy@/security@/support@/legal@ addresses per the launch checklist's own recommendation?

## Suggested order of operations

1. Apply everything marked **READY** — zero risk, every value already exists elsewhere in the
   repo, and each one has a stated reason above for why leaving it as-is is a real problem.
2. Get answers to the 8 decisions above.
3. Apply the **SUGGESTED** items using those answers.
4. Decide separately, on its own timeline, whether either **OPTIONAL / LARGER** item is worth
   doing now or later.
