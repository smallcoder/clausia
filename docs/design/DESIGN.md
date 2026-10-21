# Clausia design reference (v2)

The 20 `*.dc.html` files here are the approved screens: Home, Chat, Case, Roll and Cases, in dark and light, on desktop and mobile. They are mockups, not app code: inline styles, `{{holes}}`, `sc-for` and `sc-if` are mockup templating, and the data in `renderVals()` is fake. This version replaces v1 completely.

## Principles
- Chat-first. Clausia (never "مساعد") does everything. There is one input per screen, the composer; it searches, asks and adds. There is no separate search bar.
- Calm luxury: lots of space, few boxes, large light numbers, and gold only for things that need the lawyer's action.
- Glass only on floating controls: the top bar, tab capsule, composer, round buttons and suggestion chips. Content (cards, tables, lists) is solid. Content scrolls under the floating composer, which has a soft fade behind it.
- RTL Arabic. Desktop pages are at most 1360px wide (`max-w-page`; Home 960px `max-w-home`; Chat 820px `max-w-chat`; the composer 780px `max-w-composer`), centered. Below 1280px, full width with 32px side padding.

## Type
- UI: `-apple-system, BlinkMacSystemFont, 'SF Arabic', 'SF Pro Text', system-ui, 'Vazirmatn', sans-serif`
- Numbers: `-apple-system, 'SF Pro Display', system-ui, 'Inter', sans-serif`. Stats are large and light (weight 200–300).
- Quoted legal or court text: `'Noto Naskh Arabic', serif` (`.text-doc`, verbatim).
- Page titles are 44px desktop and 30px mobile, weight 700. Eyebrows are 12.5px, muted.

### Type scale (`--text-*` in `src/app/globals.css`)
Seven steps. Tailwind's own `text-xs…9xl` are switched off (`--text-*: initial`), so any other size does not compile.

| Class | Size | Typical use |
|---|---|---|
| `text-xs` | 11px | small labels, table heads, footnotes |
| `text-sm` | 12.5px | eyebrows, meta lines, chips |
| `text-base` | 14px | secondary body, menus, buttons |
| `text-md` | 15.5px | body (the `body` default), chat text |
| `text-lg` | 18px | card titles, section heads, day numbers |
| `text-xl` | 30px | mobile page titles, stat numbers |
| `text-2xl` | 44px | desktop page titles, big stat numbers |

The only sizes outside the seven are three display sizes, for big light numerals only:

| Class | Size | Use |
|---|---|---|
| `text-display` | 54px | the next hearing's circuit digit (mobile), the undecided count (mobile), the case's day digit (desktop) |
| `text-display-lg` | 76px | the next hearing's circuit digit (desktop) |
| `text-display-xl` | 92px | the undecided count on Home (desktop) |

No step carries a line-height: text inherits it (body 1.6) or sets `leading-*` next to the size.

## Radius (`--radius-*`)
| Class | Radius | Use |
|---|---|---|
| `rounded-sm` | 8px | only on elements of 32px or less: the «C» marks, their skeletons, the 30px file thumb, the chat bubble's tail |
| `rounded-md` | 12px | inputs, menu items, small cards, document thumbnails |
| `rounded-lg` | 20px | cards (`Card`, `Section`), tab capsule items, chips' containers |
| `rounded-xl` | 26px | page cards, sheets, the composer |
| `rounded-full` | pill | buttons, chips, dots, avatars |

Tailwind's own `rounded-xs…4xl` are switched off (`--radius-*: initial`).

## Spacing and sizes
Tailwind's spacing scale (`--spacing: 4px`; any 0.25 step works, e.g. `w-110` = 440px, `px-4.5` = 18px, `mt-0.75` = 3px). Use this order for every width, height, padding, margin, gap and offset:
1. The same value used in two or more places for the same job is a **named token** in `globals.css` (`@theme`), even when it also sits on the scale. Name it by meaning, not by number.
2. A one-off value that sits on the scale uses the plain scale class (`max-w-175`, `sm:w-105`, `min-h-5.75`).
3. A one-off value that no step can say (`calc()`, `%`, `vh`/`dvh`, `cqi`, `env(safe-area-…)`) keeps the arbitrary value and a `ds-allow: <why>` comment on the line.

Tailwind v4 reads a token from the namespace its utility uses, so the name reads well in the class:

| Namespace | Utilities it feeds | Tokens |
|---|---|---|
| `--container-*` | `w-` `min-w-` `max-w-` `basis-` | `page` 1360px (Cases, Case, Roll; `max-w-page`), `home` 960px, `chat` 820px, `composer` 780px (Home and chat composer, and the composer skeleton), `bubble` 88% (mobile) and `bubble-sm` 72% (desktop) of a chat bubble's column |
| `--spacing-*` | `size-` `h-` `w-` `min-h-` `p-` `gap-` `inset-` … | see below |

| Token | Size | Use |
|---|---|---|
| `control` | 38px | compact control on mobile and in composers: send, plus, pill, and their skeleton twins (`size-control`, `h-control`, `min-h-control`) |
| `control-lg` | 42px | glass round button in headers, the chat's case pill |
| `control-xl` | 46px | header round buttons on desktop, the roll sheet's save button, a composer's input row (`min-h-control-xl`) |
| `chip` | 34px | filter chip height on desktop (`sm:h-chip`) |
| `mark-sm` / `mark` / `mark-lg` | 22 / 26 / 30px | the «C» mark: beside a composer on mobile / in headings and on desktop composers / beside a Home message and in a page hero on desktop |
| `tick` | 22px | the round tick or state button in a proposal card |
| `dot` / `dot-lg` | 5 / 7px | the dot before a status word and the hearing count dots / a hearing's dot on a timeline |
| `glyph-sm` / `glyph` | 15 / 18px | an icon inside a pill / the arrow and plus inside a round button |

Do not add a number-named token (`--spacing-11`): it would shadow the bare multiplier (`size-11`).

The `.tap` areas stay 44px (`globals.css`): the control sizes above are the drawn sizes.

## Color (one identity, navy ink and champagne)
| Token | Light | Dark |
|---|---|---|
| page | `#ECEEF2` + white top glow | `#14161C` + faint white top glow |
| card | `#FFFFFF` | `#1C1F27` |
| text / title | `#121A2B` / `#0F1626` | `#ECEDF0` / `#FFFFFF` |
| muted / faint | `#6A6E76` / `#9A9EA6` | `#8C909A` / `#6A6E78` |
| hairline | `rgba(18,26,43,0.06)` | `rgba(255,255,255,0.06)` |
| brand mark, selected tab or filter or day | ink `#141C2E`, gold letter | `#222C44` mark, `#26314B` selected |
| primary button (send, save, record) | ink `#141C2E`, white text | `#F2F2F4`, ink text |
| gold (needs action) | `#897038` | `#D6C08F` |

- Never use a gold fill, a gradient or a glow on buttons. Gold is used for text, small dots, thin outlines and big light numbers only.
- Status uses a small dot plus a word: needs decision is gold, reserved is muted, active is green (`#1F7A4A` light, `#7FD3A4` dark), and against-us is red (`#A23B3B` light, `#E9A0A0` dark).

### Tokens (`src/app/globals.css`) — one name per meaning
Every colour literal lives in `globals.css`. Light values are on `:root`; dark values are in `:root[data-theme="dark"]` and again in the `prefers-color-scheme: dark` block (keep the two in sync). Use them as utilities (`bg-card`, `text-text-3`, `border-border-2`, `text-gold` …).

| Group | Tokens |
|---|---|
| surfaces | `bg` (+ `bg-image` glow), `card`, `card-2`, `card-3`, `field`, `chip` |
| text | `text`, `title`, `text-2`, `text-3` (muted), `text-4` (faint) |
| lines | `border`, `border-2` (hairline), `border-strong` (hover outline) |
| ink | `ink-solid` (ink in both themes, for print on the paper thumb), `mark-bg`, `mark-fg`, `selected`, `on-selected`, `primary`, `on-primary` |
| gold (needs action) | `gold`, `gold-bg` (10% wash), `gold-edge` (30% outline / ring) |
| status | `good`, `good-bg`, `bad`, `bad-bg` |
| paper thumbnail | `paper-thumb`, `paper-thumb-ink` |
| shadows | `shadow-card`, `shadow-soft`, `shadow-pop`, `shadow-mark`, `primary-shadow`, `tab-shadow`, `mark-shadow` |
| glass | `glass-bg`, `glass-filter`, `glass-border`, `glass-shadow`, `glass-icon` |
| other | `fade` (behind the composer), `skel`, `skel-hi`, `backdrop` |

Removed in the 2026-10-21 cleanup (do not bring back): the v1 / legacy names `paper`, `surface(-2)`, `ink`, `ink-2`, `ink-3`, `line`, `line-strong`, `hairline`, `hairline-v2`, `accent`, `accent-ink`, `accent-soft`, `accent-base`, `accent-text`, `accent-wash`, `accent-ring`, `accent-edge`, `accent-grad`, `accent-shadow`, `brass(-soft)`, `suggest(-soft)`, `ok(-soft)`, `danger(-soft)`, `warn(-bg)`, `amber(-bg/-text)`, `gold-text`, `primary-bg`, `page`, `chrome`, `court-tint`, `hero*`, `tile*`, `shadow-1/2/3`, `shadow-accent`, `shadow-tile`, `radius`, `radius-card`, the old `text-display/title/headline/body/callout/caption` sizes.

### Rules for code
`scripts/check-design-system.ts` (run by `scripts/final-check.sh`, with `--self-test` first) fails on any of these in `src/**/*.tsx`:
- a hex colour, `rgb(` / `rgba(` / `hsl(`;
- an arbitrary `text-[…px]`, an arbitrary `rounded…-[…]`;
- an arbitrary size or spacing value, with any variant prefix (`sm:`, `dark:`, `hover:`, `data-[…]:`) and a leading `-`: `w- h- size- min-w- min-h- max-w- max-h-`, `p*- m*-`, `gap*- space-x/y-`, `inset*- top- bottom- start- end- left- right-`, `translate*- basis- scroll-p*- scroll-m*-` followed by `[…]`.

Not checked: grid templates (`grid-cols-[…]`), `[mask…]`, `leading-[…]`, `shadow-[…]`, `bg-[…]`, `aspect-[…]`, `animate-[…]`, `transition-[…]`, arbitrary properties, and `w-(--x)` var shorthands. A real exception carries `// ds-allow: <why>` (or `/* ds-allow: <why> */`) on the same line; the reason must not be empty and covers the whole line, so keep one arbitrary value per line or name each in the reason. `npx tsx scripts/check-design-system.ts --self-test` proves each rule catches its kind and leaves the allowed forms alone.

Today's exceptions: the `theme-color` meta in `layout.tsx`; the `rounded-[inherit]` link overlay in `CaseOverview.tsx`; the safe-area `calc(…env(safe-area-inset-bottom))` paddings (Composer, HomeComposer, ChatDock, PageSkeleton ×2, ItemSheet, RollSheet, ProposalCard); the case menu's `top-[calc(100%+8px)]`; the facts timeline dot's `-start-[1.6rem]`; the sheets' `dvh` heights (ItemSheet 85, RollSheet 90, ProposalCard 88); the court text's `max-h-[60vh]`; the roll strip's `cqi` tile widths; the shares of a row or column (`max-w-[34%]` Today card, `max-w-[38%]` roll sheet, `w-[70%]` skeleton bubble, the paper thumbnail's 55 / 88 / 94% text lines).

To see that a CSS refactor changed nothing, `scripts/compare-styles.ts` saves the computed sizes, padding, margin, gap, inset and transform of every element on the 5 screens (1440 and 390, light and dark) and diffs two runs: `snap <dir> [baseUrl]`, then `diff <dirA> <dirB>`.

## Glass recipe
- Dark: a radial white sheen 15%→4% over `rgba(32,37,50,0.5)`, backdrop blur 30px, saturate 160%; a 1px white border at 9%; an inset top-left highlight; a deep shadow.
- Light: a white gradient 78%→52%, backdrop blur 24px, saturate 190%; a white border; a 0.5px ink outline at 10%; a white top inset highlight; a soft inner bottom shade; a drop shadow.

## Screen notes
- Top bar: the brand plus office name, a centered glass tab capsule (Home, Hearings, Cases), and glass circles for alerts and account. On mobile it shows the logo, the capsule (active tab labeled, the others icon-only) and the account.
- Case: who first (client big, «ضد» opponent below), then a spec sheet (number, court, circuit, type), then the next hearing, the Clausia summary, the needs-review banner, and tabs (Facts, Docs, Parties) on mobile.
- Roll: a day strip with dots per hearing, then a timeline by court; the next hearing is expanded with a "سجّل قرار الجلسة دي" button. On desktop, a side card lists past hearings that need a decision, each with a record button.

## Owner decisions (2026-10-21)
- Font: the system Arabic font (SF Arabic on Apple devices); no bundled Arabic web font.
- Tap targets: controls are drawn at the mockup sizes (36–42px) and get an invisible 44px tap area (`.tap`).
- No mic button until voice notes are built.
- Hearing location («الدور 4 · قاعة 12», «العباسية») is a stored field. Clausia proposes it from a paper or the chat through a confirmation card and never guesses it; when it is empty the circuit is shown.
- Dates stay d/m/yyyy.
- States the mockups don't draw (empty, a past hearing with no decision, tomorrow's hearings) stay as built.
- Every screen has the same soft fade behind the floating composer and chips (Home too).
- Home mobile chips scroll sideways.
- Case: judgments live in the hearings view; the links (case details, hearings, case chat, JSON) live in the «…» menu; long court / case-type names are one line with «…» on mobile.
- Case desktop header: back · breadcrumb … status chip · «…» (the menu sits at the end of the row, next to the chip). The header card keeps the mockup's widths: 4 wider data cells and 3 narrower stat cells, aligned on one line and split by hairlines.
- Cases: the third stat is «محتاجة قرار» with its own filter; each row keeps its review marker; extra status filters scroll on mobile; an active filter's clear pill comes first in the row (at the right).
- Roll: the day strip is one continuous row of days that scrolls sideways (RTL: the past on the right, the future on the left) with snap to days — drag on mobile; trackpad, shift+wheel or mouse drag on desktop. On desktop, the two small quiet glass prev/next buttons at the two ends of the strip scroll it smoothly by one week (the target week's Saturday lands at the start); the next-week arrow points left. Tapping a day selects it: the selected pill slides to it and the hearings below change with a short crossfade. With reduced motion, every change is instant.
- Roll: the strip shows Saturday–Thursday. Friday is hidden unless that week's Friday has a hearing (or is the chosen day).
- Roll (owner addition, not in the mockup): a small line above the strip — at the start (right) the month of the days in view («أكتوبر 2026», `text-sm` 12.5px, text-3), updating while you scroll.
- Roll (owner addition, not in the mockup): at the end of that line, an «النهارده» chip appears only while today is out of view; tapping it scrolls back to today and selects it.
- Chat: the card footer's second line (save as suggestions · reject all · open case) shows only after «عدّل»; the /chat list uses the thread's style.
- Loading: one shared skeleton in each page's real layout (title, stats, card or table shapes), card + hairline tokens, one calm shimmer, no spinners; the top bar and composer stay visible.
