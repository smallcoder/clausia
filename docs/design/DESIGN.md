# Clausia design reference

The 20 `*.dc.html` files here are the approved screens: Home, Chat, Case, Roll and Cases, in dark and light, on desktop and mobile. They are design mockups, not app code. Inline styles, `{{holes}}`, `sc-for` and `sc-if` are mockup templating. The sample data in `renderVals()` at the bottom of each file is fake.

## Principles
- Chat-first. Clausia (never "مساعد") does everything. Every screen has the composer, and lists and pages are views of what Clausia saved.
- Arabic RTL. The desktop chat column is 820px and centered, and desktop content is at most about 1040–1120px. Full-width layouts are not wanted.
- The look is calm and solid: depth comes from soft shadows, 1px borders and inset highlights. No loud gradients, no background patterns.

## Type
- UI: `-apple-system, BlinkMacSystemFont, 'SF Arabic', 'SF Pro Text', system-ui, 'Vazirmatn', sans-serif`
- Numbers: `-apple-system, 'SF Pro Display', system-ui, 'Inter', sans-serif`
- Quoted legal or court text: `'Noto Naskh Arabic', serif`

## Color
- Accent (champagne): `#D6C08F`. Accent gradient, kept subtle: `linear-gradient(135deg, mix(accent→white,16%) 0%, accent 45%, mix(accent→#282828,8%) 100%)`
- Ink: `#141C2E` (text `#121A2B`)
- Dark background: `radial-gradient(900px 480px at 50% -10%, rgba(214,192,143,0.07), transparent 70%), #0B0F18`
- Dark surfaces: `#141A27` (cards), `#151B29`, `#171E2D` (composer and inputs), `#171D2B` (chips), `#1E2535`
- Light background: `linear-gradient(180deg, #FFFFFF 0px, #F4F5F8 380px)`. Light cards `#FFFFFF`; cool grays `#F1F3F6`, `#ECEFF3`, `#F4F6F9`. No beige.
- Light-mode accent text: `#7A5E24`. Light mode uses ink with accent where dark mode uses the accent gradient.

## Inner-page hero header (Roll, Case, Chat, Cases)
- Back button, then an icon tile, an eyebrow line, a big title, and 3 stat tiles. The last tile holds the item that needs action and is highlighted.
- Dark: a solid ink section with an accent edge. Light: a white card with gray tiles, and the highlighted tile in ink with accent text.
