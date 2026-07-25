# Open Source Compliance Process

Status: Drafted for engineering/legal review.

## Objectives

Maintain an accurate inventory of open-source dependencies, comply with license obligations, publish required notices, and review license changes before production release.

## Inventory

Generate dependency inventory from:

- `package.json` and `package-lock.json`.
- Mobile app package files.
- Python requirements files.
- Deno Edge Function imports.
- Native Android/iOS dependency manifests.

## Review Process

1. Generate dependency/license inventory before each major release.
2. Flag copyleft, source-available, unknown, and custom licenses for legal review.
3. Maintain third-party notices if required.
4. Review new dependencies before merge when they introduce new license families.
5. Re-run inventory after dependency updates.

## Required Artifacts

- Dependency inventory.
- License summary.
- Third-party notices file if required.
- Legal approval record for restricted licenses.

## Release Gate

Production release should not proceed with unknown or unreviewed high-risk licenses.
