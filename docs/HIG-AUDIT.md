# Apple HIG audit

Method: the `hig-compliance-auditor` skill (Apple Human Interface Guidelines knowledge base) was run against the codebase after each phase; findings were fixed directly (pre-approved in the brief) and verified with Playwright (iPhone 14 and desktop viewports) plus axe-core (WCAG 2.0/2.1 A and AA, serious/critical must be zero). Scope: iOS home-screen PWA, iPadOS, desktop browsers. Framework: Next.js / Tailwind / hand-written CSS.

> Per Apple's Human Interface Guidelines. Audit by the HIG Compliance Auditor (Omraj Kumar, omrajguru.com/linktree; portfolio https://om.bearblog.dev/projects). Reference material sourced from Apple's Human Interface Guidelines.

## Phase 1 report

### Executive summary
- Issues found: 11 · Critical 0 · High 2 · Medium 7 · Low 2 · all fixed except those listed under "Open / justified".
- Platform status: iOS PWA pass · iPadOS pass · desktop pass.

### Findings and what changed

| # | Sev | Finding | HIG reference | Fix |
|---|---|---|---|---|
| 1 | High | Segmented control rows were 40pt tall (< 44pt target) | Hit targets ≥ 44×44pt | `min-height: 2.75rem` |
| 2 | High | Destructive "Revoke" sat directly beside "Resend", no confirmation | Don't place destructive actions adjacent to primary ones; confirm destructive actions | Wide separation + confirm dialog; "Remove member" separated and confirmed |
| 3 | Med | Active tab shown by colour only | Meaning must never rely on colour alone | Heavier label weight + thicker icon stroke on the active tab and sidebar item |
| 4 | Med | No tracking adjustment on system text | Manual tracking outside native: −0.43px @17pt, −0.8px @28pt | `letter-spacing: -0.025em` body, `-0.03em` large title; caps keep positive tracking |
| 5 | Med | No Increase Contrast support | Test in Increase Contrast | `prefers-contrast: more` darkens muted text, separators, control borders (light and dark) |
| 6 | Med | Tab bar label/icon would balloon at 200% text and truncate | Tab bars cap Dynamic Type growth; no truncation | Label and icon sizes capped with `min()`; labels remain readable |
| 7 | Med | Controls selectable / long-press callout on iOS | Interaction fidelity | `user-select:none; -webkit-touch-callout:none` on buttons, tabs, chips, switches (text content stays selectable) |
| 8 | Med | Sub-screens had a text button, not a back affordance | Hierarchical navigation needs a visible back control | `PageHeader back={…}` with chevron + parent title on every drill-down screen |
| 9 | Med | `apple-mobile-web-app-capable` missing from head (Next emits only `mobile-web-app-capable`) | PWA native feel | Added explicitly via metadata `other` |
| 10 | Low | Consent text had no summary of what is collected | Clarity; privacy transparency | Inline disclosure on the invite screen ("What is collected, and who sees it") |
| 11 | Low | Hover-only affordances | No hover-only interactions | None existed; verified (all states have `:active` and focus-visible) |

### Passed checks (selected)
- **Typography**: system font stack (SF on Apple), all sizes in `rem`, `font: -apple-system-body` so 1rem tracks the iOS text-size setting; body ≥ 16px; smallest label 11px (tab bar).
- **Colour**: semantic tokens, full dark mode, WCAG AA (tint on white 6.3:1, dark tint 9.9:1, muted 6.4:1); error states pair colour with text; links keep underline.
- **Materials**: translucent blur only on the control layer (tab bar, navigation bar, sidebar), never content cards; `-webkit-backdrop-filter` included; `prefers-reduced-transparency` makes them opaque.
- **Layout**: `viewport-fit=cover` + `env(safe-area-inset-*)` on tab bar, nav bar, sheets, auth screens, sidebar; no horizontal scroll at 390px.
- **Navigation**: bottom tab bar (Home, Events, Directory, Calendar, Me) on phones; sidebar from 768px; large titles collapsing into a compact bar; real links everywhere so iOS edge-swipe back works; native `<dialog>` sheets (focus trap, Esc).
- **Controls**: native `<select>` (system pickers on iOS), switches are real checkboxes with `role=switch`, chips are real checkboxes, inline validation with `aria-describedby` + `role=alert`.
- **Accessibility**: skip link, landmarks, labelled controls, focus order = DOM order, axe-core serious/critical = 0 on 9 screens × 2 viewports.
- **Motion**: `prefers-reduced-motion` neutralises all animation; no haptics faked.
- **Icons**: own stroke icon set (SF Symbols are not licensed for web); consistent 1.8 stroke.
- **Account**: in-app export and deletion (Settings).

### Open / justified (re-checked at the end of Phase 5)
- **Splash screens**: no per-device `apple-touch-startup-image` set. iOS builds a launch screen from the manifest `background_color` and icon; shipping ~20 images for every device size is high maintenance for little gain. Justified.
- **Service worker / offline**: deliberately none (D-33): authenticated member data is never cached on the device by us, and iOS installation does not need one.
- **Pull-to-refresh**: not in Phase 1 (no live lists yet). Added in Phase 2 for Home / Events / Calendar.
- **Large-text (200%) and dark-mode screenshot checks**: automated in the Phase 5 e2e suite.
- **In-app privacy notice page**: arrives with `docs/PRIVACY.md` content in Phase 5; the invite screen already carries the summary.

## Phase 2 report (Events, calendar, iCal)

Re-checked against the same HIG knowledge base, plus axe-core on 18 screens × 2 viewports (now including events, event detail, calendar month/agenda, admin events).

| # | Sev | Finding | HIG / WCAG reference | Fix |
|---|---|---|---|---|
| 12 | High | Text links had no underline (Tailwind reset), distinguished by colour only; axe `link-in-text-block` | Colour alone must not carry meaning; links ≥3:1 vs body or underlined | Underline restored for plain text links |
| 13 | Med | Selected segment was darker than its track in Dark Mode (reverse of iOS) | Consistency with system segmented controls | `--seg-on` token (white / `#636366`) |
| 14 | Low | No pull-to-refresh on live lists (iOS home-screen apps have none) | Pull to refresh where it makes sense | `PullToRefresh` (touch devices only, top of page only, never inside a dialog) |

Passed in this phase: RSVP choices are real buttons with `aria-pressed`, ≥44pt, with a check mark (not colour-only); calendar days are ≥44pt links with full spoken labels ("Monday 30 November, 2 items"), today is a filled circle and races use a square dot (shape, not just colour); dates/times use native `datetime-local` pickers and `Intl` (viewer zone first, event-local beside it); destructive actions (cancel event, remove attendee) are separated and confirmed; maps link opens Apple Maps.

Still open (Phase 5): 200% text-size and dark-mode screenshot checks of the main screens; final audit of the whole app.

## Phase 3 report (race board, announcements, recaps, nominations)

| # | Sev | Finding | HIG / WCAG reference | Fix |
|---|---|---|---|---|
| 15 | Med | Confirmations after an admin action (approve/decline) disappeared when the list re-rendered | Feedback: acknowledge every action | Item moves visibly to a "Decided" group with a status badge; other forms keep inline `role=status` messages |
| 16 | Med | Destructive "Remove race", "Decline", "Delete recap" lacked separation/confirmation | Confirm destructive actions; keep them away from primary actions | Separated with wide gaps and `confirm()` |
| 17 | Low | Skeleton loading states announced nothing | Accessible loading feedback | `role=status` + visually hidden "Loading…" on every skeleton; per-segment `loading.tsx` |

Passed: date inputs are native pickers; every sheet form validates inline with `aria-describedby`; race "I'm going too" is a ≥44pt button with visible state ("You're going" badge, not colour-only); goal time is never shown to anyone but its owner; announcement composer confirms before sending; all long text uses the safe Markdown subset (no HTML).

Axe sweep extended to announcements, nominate, races, admin announcements/applications: no serious/critical findings.

## Phase 4 report (Strava)

| # | Sev | Finding | HIG reference | Fix |
|---|---|---|---|---|
| 18 | Med | Disconnect confirmation vanished when the panel re-rendered | Acknowledge every action | Redirect with a persistent flash message ("Disconnected. Your Strava tokens, event results and badge have been erased.") |
| 19 | Med | The leaderboard opt-in must be informed and reversible | Privacy transparency; no dark patterns | Consent switch shown *before* connecting, with plain-language effect; same switch afterwards; turning it off removes results at once |

Passed: destructive Disconnect is separated and confirmed; leaderboard rank is a number, not colour; the feature is invisible (not a disabled button) when off; demo mode is labelled as such; all Strava errors give a plain next step (connect again / allow activity access).
