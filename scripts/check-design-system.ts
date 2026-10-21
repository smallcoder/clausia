// Design-system check (docs/design/DESIGN.md «Rules for code»): fails on any of these in src/**/*.tsx —
//   a hex colour, rgb( / rgba( / hsl( / hsla(, an arbitrary font size text-[…px|rem|em], an arbitrary radius rounded…-[…],
//   and an arbitrary size or spacing value (any variant prefix: sm:, dark:, hover:, data-[…]:, a leading «-»):
//     width/height  w- h- size- min-w- min-h- max-w- max-h- (and inline-/block-)
//     padding/margin  p*- m*-        gap/space  gap*- space-x/y-
//     inset/position  inset*- top- bottom- start- end- left- right-
//     other offsets  translate*- basis- scroll-p*- scroll-m*-
// Colours live in src/app/globals.css as tokens; sizes and radii use the scales there (text-xs…2xl, display; rounded-sm…xl, full;
// the spacing scale, plus the named --spacing-* / --container-* tokens: size-control, max-w-page …).
// NOT checked on purpose: grid templates (grid-cols-[…]), [mask…], leading-[…], shadow-[…], bg-[…], aspect-[…], animate-[…],
// transition-[…], arbitrary properties ([field-sizing:content]), and var shorthands such as w-(--x).
// An allowed exception carries a short reason on the same line: `// ds-allow: <why>` or `/* ds-allow: <why> */`.
// (The reason covers the whole line: keep one arbitrary value per line, or name each in the reason.)
// Run: npx tsx scripts/check-design-system.ts               (exit 1 and a list when something is found; scripts/final-check.sh runs it)
//      npx tsx scripts/check-design-system.ts --self-test   (proves each rule catches its kind and leaves the allowed forms alone)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");

// «-» + utility + «-[» not preceded by a word char or a hyphen, so `grid-cols-[…]` or `outline-offset-[-2px]` never match the short names.
const arbitrary = (utilities: string): RegExp => new RegExp(String.raw`(?<![\w-])-?(?:${utilities})-\[[^\]\s]+\]`, "g");

const RULES: [string, RegExp][] = [
  ["hex colour", /(?<![&\w])#(?![0-9]+\b)(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g],
  ["rgb()/hsl() colour", /\b(?:rgba?|hsla?)\(/gi],
  ["arbitrary text size", /(?<![\w-])text-\[[0-9.]+(?:px|rem|em)\]/g],
  ["arbitrary radius", /(?<![\w-])rounded(?:-[a-z]{1,2})?-\[[^\]]*\]/g],
  ["arbitrary width/height", arbitrary("min-w|min-h|max-w|max-h|min-inline|max-inline|min-block|max-block|inline|block|w|h|size")],
  ["arbitrary padding/margin", arbitrary("p(?:[xytblrse]|[bi][se])?|m(?:[xytblrse]|[bi][se])?")],
  ["arbitrary gap/space", arbitrary("gap(?:-[xy])?|space-[xy]")],
  ["arbitrary inset/position", arbitrary("inset(?:-[a-z]{1,2})?|top|bottom|start|end|left|right")],
  ["arbitrary translate/basis/scroll offset", arbitrary("translate(?:-[xyz])?|basis|scroll-[pm][xytblrse]?")],
];
const ALLOW = /ds-allow:\s*[^\s*/]/;

/** What is wrong on one line (empty when the line is clean or carries a ds-allow reason); `allowed` says a reason was used. */
function checkLine(line: string): { hits: string[]; allowed: boolean } {
  const hits = RULES.flatMap(([name, re]) => [...line.matchAll(re)].map((m) => `${name} «${m[0]}»`));
  if (!hits.length) return { hits, allowed: false };
  return ALLOW.test(line) ? { hits: [], allowed: true } : { hits, allowed: false };
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? tsxFiles(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

// ---- self-test: every kind is caught (with variants, negatives, strings), the allowed forms are left alone ----
const MUST_FLAG: [string, string][] = [
  ["hex colour", `<i className="bg-[#fff]" style={{ color: "#A23B3B" }} />`],
  ["rgb()/hsl() colour", `<i style={{ color: "rgba(0,0,0,.5)" }} />`],
  ["arbitrary text size", `<i className="text-[13px]" />`],
  ["arbitrary radius", `<i className="rounded-t-[14px]" />`],
  ["arbitrary width/height", `<i className="w-[440px]" />`],
  ["arbitrary width/height", `<i className="sm:h-[46px]" />`],
  ["arbitrary width/height", `<i className="size-[11px] lg:min-w-[3rem] hover:max-h-[60vh]" />`],
  ["arbitrary width/height", `<i className="sm:dark:size-[32px]" />`],
  ["arbitrary width/height", `<i className="w-[calc(100cqi/7)]" />`],
  ["arbitrary width/height", `<i className={\`\${on ? "max-w-[1360px]" : ""}\`} />`],
  ["arbitrary width/height", `cx("flex", x && "min-h-[23px]")`],
  ["arbitrary width/height", `<i className="max-w-[88%] min-block-[2px]" />`],
  ["arbitrary padding/margin", `<i className="px-[18px]" />`],
  ["arbitrary padding/margin", `<i className="-mt-[3px]" />`],
  ["arbitrary padding/margin", `<i className="sm:-ms-[2px]" />`],
  ["arbitrary padding/margin", `<i className="data-[state=open]:pb-[2px]" />`],
  ["arbitrary padding/margin", `<i className="pb-[calc(20px+env(safe-area-inset-bottom))]" />`],
  ["arbitrary padding/margin", `<i className="p-[5px] m-[3px] pbs-[4px] mie-[4px]" />`],
  ["arbitrary gap/space", `<i className="gap-[7px] md:gap-x-[9px] gap-y-[2px]" />`],
  ["arbitrary gap/space", `<i className="space-y-[5px] space-x-[1px]" />`],
  ["arbitrary inset/position", `<i className="inset-x-[3px] inset-[2px] inset-bs-[1px]" />`],
  ["arbitrary inset/position", `<i className="top-[calc(100%+8px)] -start-[1.6rem] end-[3px] left-[1px] right-[2px] bottom-[4px]" />`],
  ["arbitrary translate/basis/scroll offset", `<i className="translate-y-[2px] -translate-x-[3px] translate-[1px] basis-[30%]" />`],
  ["arbitrary translate/basis/scroll offset", `<i className="scroll-pt-[8px] scroll-m-[2px]" />`],
];
const MUST_PASS: string[] = [
  `<i className="max-w-page sm:w-110 size-control h-chip -mt-1.5 sm:-ms-0.5 inset-x-0 top-1/2 -translate-y-1/2 basis-1/2 gap-x-2.5 space-y-3 scroll-pt-4" />`,
  `<i className="max-w-7/8 w-(--sheet) size-dot-lg p-0 pb-px min-w-0" />`,
  `<i className="grid-cols-[1fr_auto_1fr] [grid-template-columns:repeat(7,1fr)]" />`,
  `<i className="leading-[1.75] leading-[22px] tracking-[0.02em] aspect-[3/4]" />`,
  `<i className="shadow-[var(--tab-shadow)] shadow-[0_0_0_4px_var(--gold-edge)] bg-[linear-gradient(to_top,var(--bg)_45%,transparent)]" />`,
  `<i className="[field-sizing:content] transition-[color] focus-visible:outline-offset-[-2px] [mask-image:linear-gradient(black,transparent)]" />`,
  `<i className="animate-[sheet-up_260ms_cubic-bezier(0.32,0.72,0,1)] sm:[animation:fade-in_180ms_ease-out] ring-offset-[3px]" />`,
  `<i className="text-doc text-md rounded-full rounded-t-xl border-[1.5px]" />`,
  `// a comment: w-1360 and p-4 and the word top-level are not arbitrary values`,
  `const gap = 4; const top = [1, 2]; const size = "sm"; const h = [3];`,
  `<i className="w-[calc(100cqi/7)]" /* ds-allow: 7 day tiles fill the strip */ />`,
  `<i className="max-h-[85dvh]" /* ds-allow: dvh: the sheet is at most 85% of the screen */>`,
  `"max-w-[88%]" // ds-allow: a share of the row`,
];
const MUST_NOT_ALLOW = [
  `<i className="w-[440px]" /* ds-allow: */ />`,
  `<i className="w-[440px]" // ds-allow:   `,
  `<i className="w-[440px]" /* ds-allow */ />`,
  `<i className="w-[440px]" /* ds-allow:*/ />`,
];

function selfTest(): boolean {
  const bad: string[] = [];
  for (const [kind, line] of MUST_FLAG) {
    const { hits } = checkLine(line);
    if (!hits.some((h) => h.startsWith(kind + " "))) bad.push(`should flag as «${kind}»: ${line}`);
  }
  for (const line of MUST_PASS) {
    const { hits } = checkLine(line);
    if (hits.length) bad.push(`should pass, got ${hits.join(", ")}: ${line}`);
  }
  for (const line of MUST_NOT_ALLOW) {
    if (!checkLine(line).hits.length) bad.push(`an empty ds-allow reason must not pass: ${line}`);
  }
  // every rule has at least one must-flag fixture
  for (const [name] of RULES) if (!MUST_FLAG.some(([k]) => k === name)) bad.push(`no fixture for rule «${name}»`);
  // an allowed line is counted as allowed, a clean line is not
  if (!checkLine(`<i className="max-h-[85dvh]" /* ds-allow: why */>`).allowed) bad.push("an allowed line is not counted");
  if (checkLine(`<i className="max-h-96" />`).allowed) bad.push("a clean line is counted as allowed");
  if (bad.length) {
    console.error(`design-system self-test: ${bad.length} problem(s)`);
    for (const b of bad) console.error("  " + b);
    return false;
  }
  console.log(`design-system self-test: OK (${MUST_FLAG.length} flagged, ${MUST_PASS.length} passed, ${MUST_NOT_ALLOW.length} empty reasons refused, ${RULES.length} rules)`);
  return true;
}

if (process.argv.includes("--self-test")) process.exit(selfTest() ? 0 : 1);

const found: string[] = [];
let allowed = 0;
for (const file of tsxFiles(join(ROOT, "src"))) {
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    const r = checkLine(line);
    if (r.allowed) allowed++;
    if (r.hits.length) found.push(`${relative(ROOT, file)}:${i + 1}  ${r.hits.join(", ")}`);
  });
}

if (found.length) {
  console.error(`design-system check: ${found.length} line(s) off the tokens/scales (mark a real exception with «ds-allow: <why>» on the same line):`);
  for (const f of found) console.error("  " + f);
  process.exit(1);
}
console.log(`design-system check: OK (${allowed} ds-allow exception${allowed === 1 ? "" : "s"})`);
