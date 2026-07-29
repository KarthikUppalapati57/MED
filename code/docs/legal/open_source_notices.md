# Open Source & Third-Party Notices

**Last updated:** July 27, 2026
**Source of truth:** [code/src/modules/public/pages/OpenSourceNotices.jsx](../../src/modules/public/pages/OpenSourceNotices.jsx) (route `/open-source`) — update both if either changes.

> Generated from an automated scan (`license-checker`) on July 27, 2026 against production dependencies only. Counts change as dependencies change — regenerate before each production release rather than editing this list by hand.

## 1. Overview

The Restops platform is built using open-source software components, each governed by its own license. This page summarizes the scan results; the full package-by-package list is maintained at [third_party_notices.md](third_party_notices.md) (532 packages) and is available on request.

## 2. License Summary

532 production packages (including transitive dependencies) were scanned, covering 11 distinct license identifiers:

| License | Package Count |
| --- | --- |
| MIT | 473 |
| ISC | 27 |
| Apache-2.0 | 17 |
| BSD-3-Clause | 7 |
| MIT (inferred) | 2 |
| MPL-2.0 OR Apache-2.0 (dual) | 1 |
| BSD-2-Clause | 1 |
| MIT AND Zlib | 1 |
| 0BSD | 1 |
| MIT AND ISC | 1 |

Regenerate with: `npx license-checker --production --json` (run from `code/`).

## 3. Flagged for Legal Review

None currently. **Update, 2026-07-27:** the previously-flagged **react-leaflet** and **@react-leaflet/core** (Hippocratic-2.1, an "ethical source" license with human-rights-conduct-tied usage restrictions — a materially different risk profile than the MIT/Apache/BSD licenses covering the rest of the dependency tree) have been removed from `package.json`. They were confirmed unused anywhere in application code (zero imports, static or dynamic) before removal; the build was re-run clean afterward. If a map/location feature is ever planned, re-evaluate the license question fresh at that point rather than reintroducing this dependency without review.

The remaining non-standard entries are low-risk and typical for a JavaScript dependency tree: `dompurify` is dual-licensed (MPL-2.0 OR Apache-2.0 — pick Apache-2.0 to avoid MPL's file-level copyleft terms), `pako` is MIT AND Zlib, `victory-vendor` is MIT AND ISC, and `rgbcolor`/`webgl-constants` show as "MIT*" because the license-checker tool inferred the license from a LICENSE file rather than an explicit `license` field in package.json.

## 4. Requesting License Texts

The full text of any applicable open-source license can be requested at [LEGAL CONTACT EMAIL].

## 5. No Warranty from Third-Party Licensors

Open-source components are provided by their respective authors and licensors "as is," subject to the terms of their individual licenses, without warranty from Restops beyond what Restops separately commits to in its own Terms of Service.

## 6. Contact

Questions about open-source usage or attribution can be sent to [LEGAL CONTACT EMAIL].
