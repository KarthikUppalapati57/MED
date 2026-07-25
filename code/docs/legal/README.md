# Legal & Policy Documents

Markdown source for the live legal pages in `src/modules/public/pages/`. The package-backed public pages import these Markdown files directly, so the rendered app and counsel-review documents stay aligned.

These are policy drafts from the RestOps-360 Legal Policy Package dated July 24, 2026. They should receive final review by licensed counsel before production publication or contractual reliance.

## Public Policy Pages

| Document | File | Route | Source |
| --- | --- | --- | --- |
| Terms of Service | [terms_of_service.md](terms_of_service.md) | `/terms` | 2026-07-24 package |
| Privacy Policy | [privacy_policy.md](privacy_policy.md) | `/privacy` | 2026-07-24 package |
| SMS Terms and Conditions | [sms_terms_and_conditions.md](sms_terms_and_conditions.md) | `/sms-terms` | 2026-07-24 package |
| Acceptable Use Policy | [acceptable_use_policy.md](acceptable_use_policy.md) | `/acceptable-use` | 2026-07-24 package |
| Cookie Policy | [cookie_policy.md](cookie_policy.md) | `/cookies` | 2026-07-24 package |
| Data Processing Addendum | [data_processing_addendum.md](data_processing_addendum.md) | `/dpa` | 2026-07-24 package |
| Security Policy | [security_policy.md](security_policy.md) | `/security` | 2026-07-24 package |
| Service Level Agreement | [service_level_agreement.md](service_level_agreement.md) | `/sla` | 2026-07-24 package |
| Subprocessor List | [subprocessor_list.md](subprocessor_list.md) | `/subprocessors` | 2026-07-24 package |

## Supplementary Public Pages

These pages remain platform-specific drafts that were already present in the app.

| Document | File | Route | Status |
| --- | --- | --- | --- |
| Vendor Portal Terms | [vendor_portal_terms.md](vendor_portal_terms.md) | `/vendor-terms` | Draft |
| AI Features Addendum | [ai_features_addendum.md](ai_features_addendum.md) | `/ai-terms` | Draft |
| Open Source & Third-Party Notices | [open_source_notices.md](open_source_notices.md) | `/open-source` | Draft; backed by generated third-party notice data |
| CCPA Notice at Collection & Privacy Choices | [ccpa_privacy_rights.md](ccpa_privacy_rights.md) | `/ccpa-privacy-rights` | Draft |
| Master Subscription Agreement | [master_subscription_agreement.md](master_subscription_agreement.md) | `/msa` | Template |
| Accessibility Statement | [accessibility_statement.md](accessibility_statement.md) | `/accessibility` | Draft |

## Internal Implementation Notes

These files are kept for launch/compliance implementation tracking and are not public routes.

- [restops_360_legal_launch_checklist.md](restops_360_legal_launch_checklist.md)
- [website_sms_compliance_implementation.md](website_sms_compliance_implementation.md)
- [legal_pages_remediation_plan.md](legal_pages_remediation_plan.md) - page-by-page current-state vs. proposed-change plan for the 6 supplementary pages plus `/ai-usage`, `/data-retention`, the site footer, and `/docs`. Draft, pending approval; no code changes applied yet.

## Generated Data

- [third_party_notices.md](third_party_notices.md) - generated package license list backing the Open Source Notices summary. Regenerate before each release rather than hand-editing.
