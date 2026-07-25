# Legal & Policy Documents

Markdown mirror of the live legal pages in `code/src/modules/public/pages/`. Each file's "Source of truth" line links back to its JSX page — the JSX is what actually renders to users; these `.md` files are for review, sharing with counsel, and version-controlled diffing.

All documents below still contain `[BRACKETED PLACEHOLDER]` values pending business/legal sign-off. See [platform_legal_privacy_inventory_draft.md](../platform_legal_privacy_inventory_draft.md) for the full outstanding-decisions tracker.

## Core documents

Mapped 1:1 to the Document Mapping table in the platform legal & privacy inventory.

| Document | File | Route | Status |
| --- | --- | --- | --- |
| Terms of Service | [terms_of_service.md](terms_of_service.md) | `/terms` | Draft — governing law, venue, arbitration, entity name pending |
| Privacy Policy | [privacy_policy.md](privacy_policy.md) | `/privacy` | Draft — subprocessor regions, DSAR process pending |
| Cookie Policy | [cookie_policy.md](cookie_policy.md) | `/cookies` | Draft — accurate as of current (no analytics in production) |
| Acceptable Use Policy | [acceptable_use_policy.md](acceptable_use_policy.md) | `/acceptable-use` | Draft — contact emails pending |
| Security Policy | [security_policy.md](security_policy.md) | `/security` | Draft — backup/RPO-RTO, severity matrix pending |
| Data Processing Addendum | [data_processing_addendum.md](data_processing_addendum.md) | `/dpa` | Draft — legal entity name, transfer mechanism pending |
| Service Level Agreement | [service_level_agreement.md](service_level_agreement.md) | `/sla` | Draft — service credit schedule is an open business decision |

## Supplementary documents

Not in the original mapping table; added to round out gaps the inventory itself flags (vendor status, AI/beta terms, open-source attribution, CCPA notice-at-collection) or that are standard for a B2B SaaS launch (MSA, accessibility).

| Document | File | Route | Status |
| --- | --- | --- | --- |
| Vendor Portal Terms | [vendor_portal_terms.md](vendor_portal_terms.md) | `/vendor-terms` | Draft — contact emails pending |
| AI Features Addendum | [ai_features_addendum.md](ai_features_addendum.md) | `/ai-terms` | Draft — contact email pending |
| Open Source & Third-Party Notices | [open_source_notices.md](open_source_notices.md) | `/open-source` | Placeholder — attribution list not yet auto-generated |
| CCPA Notice at Collection & Privacy Choices | [ccpa_privacy_rights.md](ccpa_privacy_rights.md) | `/ccpa-privacy-rights` | Draft — authorized-agent process pending |
| Master Subscription Agreement | [master_subscription_agreement.md](master_subscription_agreement.md) | `/msa` | Template — only applies to Customers with a signed Order Form; renewal/cure periods pending |
| Accessibility Statement | [accessibility_statement.md](accessibility_statement.md) | `/accessibility` | Draft — formal WCAG audit not yet performed |
