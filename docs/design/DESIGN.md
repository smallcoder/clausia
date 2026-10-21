# Clausia design reference (v2)

The 20 `*.dc.html` files here are the approved screens: Home, Chat, Case, Roll and Cases, in dark and light, on desktop and mobile. They are mockups, not app code: inline styles, `{{holes}}`, `sc-for` and `sc-if` are mockup templating, and the data in `renderVals()` is fake. This version replaces v1 completely.

## Principles
- Chat-first. Clausia (never "مساعد") does everything. There is one input per screen, the composer; it searches, asks and adds. There is no separate search bar.
- Calm luxury: lots of space, few boxes, large light numbers, and gold only for things that need the lawyer's action.
- Glass only on floating controls: the top bar, tab capsule, composer, round buttons and suggestion chips. Content (cards, tables, lists) is solid. Content scrolls under the floating composer, which has a soft fade behind it.
- RTL Arabic. Desktop pages are at most 1360px wide (Home and Chat 960px; the composer 780px), centered. Below 1280px, full width with 32px side padding.

## Type
- UI: `-apple-system, BlinkMacSystemFont, 'SF Arabic', 'SF Pro Text', system-ui, 'Vazirmatn', sans-serif`
- Numbers: `-apple-system, 'SF Pro Display', system-ui, 'Inter', sans-serif`. Stats are large and light (weight 200–300).
- Quoted legal or court text: `'Noto Naskh Arabic', serif`
- Page titles are 44–46px desktop and 30–36px mobile, weight 700. Eyebrows are 12–13px, muted.

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

## Glass recipe
- Dark: a radial white sheen 15%→4% over `rgba(32,37,50,0.5)`, backdrop blur 30px, saturate 160%; a 1px white border at 9%; an inset top-left highlight; a deep shadow.
- Light: a white gradient 78%→52%, backdrop blur 24px, saturate 190%; a white border; a 0.5px ink outline at 10%; a white top inset highlight; a soft inner bottom shade; a drop shadow.

## Screen notes
- Top bar: the brand plus office name, a centered glass tab capsule (Home, Hearings, Cases), and glass circles for alerts and account. On mobile it shows the logo, the capsule (active tab labeled, the others icon-only) and the account.
- Case: who first (client big, «ضد» opponent below), then a spec sheet (number, court, circuit, type), then the next hearing, the Clausia summary, the needs-review banner, and tabs (Facts, Docs, Parties) on mobile.
- Roll: a day strip with dots per hearing, then a timeline by court; the next hearing is expanded with a "سجّل قرار الجلسة دي" button. On desktop, a side card lists past hearings that need a decision, each with a record button.
