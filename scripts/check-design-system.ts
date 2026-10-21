// Design-system check (docs/design/DESIGN.md «Rules for code»): fails on any of these in src/**/*.tsx —
//   a hex colour, rgb( / rgba( / hsl( / hsla(, an arbitrary font size text-[…px|rem|em], an arbitrary radius rounded…-[…].
// Colours live in src/app/globals.css as tokens; sizes and radii use the scales there (text-xs…2xl, display; rounded-sm…xl, full).
// An allowed exception carries a short reason on the same line: `// ds-allow: <why>` or `/* ds-allow: <why> */`.
// Run: npx tsx scripts/check-design-system.ts   (exit 1 and a list when something is found; scripts/final-check.sh runs it)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const RULES: [string, RegExp][] = [
  ["hex colour", /(?<![&\w])#(?![0-9]+\b)(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g],
  ["rgb()/hsl() colour", /\b(?:rgba?|hsla?)\(/gi],
  ["arbitrary text size", /(?<![\w-])text-\[[0-9.]+(?:px|rem|em)\]/g],
  ["arbitrary radius", /(?<![\w-])rounded(?:-[a-z]{1,2})?-\[[^\]]*\]/g],
];

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? tsxFiles(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

const found: string[] = [];
let allowed = 0;
for (const file of tsxFiles(join(ROOT, "src"))) {
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    const hits = RULES.flatMap(([name, re]) => [...line.matchAll(re)].map((m) => `${name} «${m[0]}»`));
    if (!hits.length) return;
    if (/ds-allow:\s*[^\s*/]/.test(line)) { allowed++; return; }
    found.push(`${relative(ROOT, file)}:${i + 1}  ${hits.join(", ")}`);
  });
}

if (found.length) {
  console.error(`design-system check: ${found.length} line(s) off the tokens/scales (mark a real exception with «ds-allow: <why>» on the same line):`);
  for (const f of found) console.error("  " + f);
  process.exit(1);
}
console.log(`design-system check: OK (${allowed} ds-allow exception${allowed === 1 ? "" : "s"})`);
