#!/usr/bin/env bash
# PR 7 (محرر المذكرة): runs the migration SQL AND the RLS test in ONE transaction that is rolled back (the test ends with RAISE, so nothing can commit).
# Use it BEFORE applying the migration: it proves the exact migration text creates a working table with working RLS, and persists nothing.
# After the migration is applied, run scripts/test-draft-versions-rls.sql alone (same test, against the real table).
set -euo pipefail
cd "$(dirname "$0")/.."
TMP=$(mktemp -t draft-editor-rehearsal.XXXXXX)
trap 'rm -f "$TMP"' EXIT
{
  echo "begin;"
  cat supabase/migrations/20261027100000_draft_versions.sql
  # the test file starts with its own `begin;`: drop that one line, keep the rest (the DO block raises, then `rollback;`)
  sed '0,/^begin;$/{/^begin;$/d;}' scripts/test-draft-versions-rls.sql
} > "$TMP"
scripts/sql.sh -f "$TMP"
