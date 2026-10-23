#!/usr/bin/env bash
# Final checks after merge: design system, RLS, next hearing, intake (chat), documents. Prints a summary line per check.
set -u
cd "$(dirname "$0")/.."
T="npx tsx --conditions=react-server --env-file=.env.local"
status=0
# design system first: no colour literals, no off-scale text sizes, radii, sizes or spacing in src/**/*.tsx (no DB, no LLM); the self-test proves the rules
echo "=== check-design-system"
if npx tsx scripts/check-design-system.ts --self-test && npx tsx scripts/check-design-system.ts; then echo "PASS check-design-system"; else echo "FAIL check-design-system"; status=1; fi
for s in test-rls test-deadlines test-deadlines-flow test-brief test-morning test-next-hearing test-no-guess test-doc-columns test-card-modes test-intake test-docs; do
  if [ -f "scripts/$s.ts" ]; then
    echo "=== $s"
    if $T "scripts/$s.ts" > "screenshots/$s.log" 2>&1; then echo "PASS $s"; else echo "FAIL $s (see screenshots/$s.log)"; status=1; fi
    tail -15 "screenshots/$s.log"
  else
    echo "MISSING scripts/$s.ts"; status=1
  fi
done
scripts/sql.sh "select purpose, model, count(*) calls, round(sum(cost_usd)::numeric,4) usd, round(avg(latency_ms)) avg_ms from llm_calls group by 1,2 order by 1,2"
exit $status
