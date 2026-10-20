#!/usr/bin/env bash
# Run SQL on the clausia Supabase project through the Management API.
# Usage: scripts/sql.sh "select 1"   or   scripts/sql.sh -f file.sql
# The token is read from the Supabase CLI login in the macOS keychain (never stored in the repo).
set -euo pipefail
REF=kbghqgbinmyflygqwdok
TOKEN=$(security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | { read -r t; if [[ "$t" == sbp_* ]]; then echo "$t"; else echo "$t" | base64 -d; fi; })
if [[ "${1:-}" == "-f" ]]; then Q=$(cat "$2"); else Q="$1"; fi
python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$Q" \
  | curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @-
echo
