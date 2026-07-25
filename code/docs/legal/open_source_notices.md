# Open Source & Third-Party Notices

**Last updated:** July 24, 2026
**Source of truth:** [code/src/modules/public/pages/OpenSourceNotices.jsx](../../src/modules/public/pages/OpenSourceNotices.jsx) (route `/open-source`) — update both if either changes.

> Generated from an automated scan (`license-checker`) on July 25, 2026 against production dependencies only. Counts change as dependencies change — regenerate before each production release rather than editing this list by hand.

## 1. Overview

The Restops platform is built using open-source software components, each governed by its own license. This page summarizes the scan results; the full package-by-package list is maintained at [third_party_notices.md](third_party_notices.md) (534 packages) and is available on request.

## 2. License Summary

534 production packages (including transitive dependencies) were scanned, covering 11 distinct license identifiers:

| License | Package Count |
| --- | --- |
| MIT | 473 |
| ISC | 27 |
| Apache-2.0 | 17 |
| BSD-3-Clause | 7 |
| Hippocratic-2.1 | 2 |
| BSD-2-Clause | 2 |
| MIT (inferred) | 2 |
| MPL-2.0 OR Apache-2.0 (dual) | 1 |
| MIT AND Zlib | 1 |
| 0BSD | 1 |
| MIT AND ISC | 1 |

Regenerate with: `npx license-checker --production --json` (run from `code/`).

## 3. Flagged for Legal Review

**react-leaflet** and **@react-leaflet/core** (used for map/location features) are licensed under **Hippocratic-2.1**, an "ethical source" license, not a standard OSI-approved open-source license. It grants use rights subject to conditions tied to human-rights-related conduct standards, which is a materially different risk profile than the MIT/Apache/BSD licenses covering the rest of the dependency tree. This needs an actual legal review before production publication — not assessed here beyond flagging it.

The remaining non-standard entries are low-risk and typical for a JavaScript dependency tree: `dompurify` is dual-licensed (MPL-2.0 OR Apache-2.0 — pick Apache-2.0 to avoid MPL's file-level copyleft terms), `pako` is MIT AND Zlib, `victory-vendor` is MIT AND ISC, and `rgbcolor`/`webgl-constants` show as "MIT*" because the license-checker tool inferred the license from a LICENSE file rather than an explicit `license` field in package.json.

## 4. Requesting License Texts

The full text of any applicable open-source license can be requested at [LEGAL CONTACT EMAIL].

## 5. No Warranty from Third-Party Licensors

Open-source components are provided by their respective authors and licensors "as is," subject to the terms of their individual licenses, without warranty from Restops beyond what Restops separately commits to in its own Terms of Service.

## 6. Contact

Questions about open-source usage or attribution can be sent to [LEGAL CONTACT EMAIL].
