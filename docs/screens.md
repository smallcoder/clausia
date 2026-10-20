# Screens (mobile-first, Arabic RTL, dates d/m/yyyy)

| route | screen | owner |
|---|---|---|
| /login | email + password, sign up creates the office | base |
| / | home: today's + tomorrow's hearings, past hearings with no decision (tap → record decision) | hearings |
| /chat, /chat/[threadId] | assistant: general chat for new clients/cases; upload; confirmation cards | chat (+documents for upload/reading) |
| /hearings | roll by day / week, grouped by court | hearings |
| /cases | cases list with search | case pages |
| /cases/[id]?tab= | case page: الملخص، الوقائع، الأطراف، الطلبات والدفوع، الجلسات، المستندات، الأحكام، المحادثة; empty «تحليل Clausia» slot on the summary | case pages (tabs owned per feature) |

Shell: right sidebar on desktop (≥1024px), bottom tab bar on mobile. Fonts: IBM Plex Sans Arabic (UI),
Noto Naskh Arabic (document text, `.text-doc`). Tokens in `src/app/globals.css`; primitives in `src/components/ui.tsx`.
No big forms: small inline edits only; everything else goes through the assistant.
