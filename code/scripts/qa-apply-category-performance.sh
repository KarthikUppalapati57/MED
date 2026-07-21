#!/usr/bin/env bash
# QA-only migration apply for Category Performance Report.
# Project ref: hbzkntgdryvoeplzhlqu
#
# SAFETY RULES
# - Never run `supabase db push --include-all` on this project: QA has
#   out-of-order migration history and push would apply dozens of unrelated files.
# - Never apply while linked to production (gsupqfmwlsmwoybphimx).
# - Apply ONLY 20260721000010_category_performance_report.sql.
#
# Preferred method (CLI linked to QA):
#   cd code
#   test "$(cat supabase/.temp/project-ref)" = "hbzkntgdryvoeplzhlqu"
#   supabase db query --linked -f supabase/migrations/20260721000010_category_performance_report.sql
#   # optional history row:
#   supabase db query --linked "INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
#     VALUES ('20260721000010','category_performance_report',ARRAY['qa-only db query'])
#     ON CONFLICT (version) DO NOTHING;"
#   supabase db query --linked -f scripts/qa-validate-category-performance.sql
#
# Alternate (psql with QA DB URL):
#   export QA_DB_URL='postgresql://...'
#   ./scripts/qa-apply-category-performance.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/20260721000010_category_performance_report.sql"
EXPECTED_REF="hbzkntgdryvoeplzhlqu"

if [[ -z "${QA_DB_URL:-}" ]]; then
  echo "ERROR: Set QA_DB_URL for the psql path, or use the preferred supabase db query --linked steps in the header."
  exit 1
fi

if [[ "$QA_DB_URL" == *"gsupqfmwlsmwoybphimx"* ]]; then
  echo "ERROR: QA_DB_URL appears to point at production. Aborting."
  exit 1
fi

if [[ "$QA_DB_URL" != *"${EXPECTED_REF}"* && "${QA_ALLOW_UNMATCHED_URL:-}" != "1" ]]; then
  echo "WARNING: QA_DB_URL does not contain ${EXPECTED_REF}."
  echo "Set QA_ALLOW_UNMATCHED_URL=1 only if you verified this is QA."
  exit 1
fi

echo "Applying Category Performance migration to QA via QA_DB_URL..."
psql "$QA_DB_URL" -v ON_ERROR_STOP=1 -f "$MIGRATION"
echo "Done. Next: psql \"\$QA_DB_URL\" -f scripts/qa-validate-category-performance.sql"
