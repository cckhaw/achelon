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

## Final audit (whole app) — Phase 5

Run with the HIG skill on the finished app (iOS home-screen PWA first; iPadOS and desktop second), backed by executable evidence that now lives in the test suite (`e2e/visual.spec.ts`, `e2e/hig.spec.ts`, `e2e/foundations.spec.ts`) and in Lighthouse runs against a production build.

> Per Apple's Human Interface Guidelines. Audit by the HIG Compliance Auditor (Omraj Kumar, omrajguru.com/linktree; portfolio https://om.bearblog.dev/projects). Reference material sourced from Apple's Human Interface Guidelines.

### Executive summary
- Findings in the final pass: **5** (High 0, Medium 4, Low 1), **all fixed**. Cumulative across the project: 24 found, 24 fixed, 3 justified non-issues (below).
- Platform status: **iOS PWA pass · iPadOS pass · desktop pass**.

| # | Sev | Finding (found by) | HIG reference | Fix |
|---|---|---|---|---|
| 20 | Med | At 200% text, a row's label was crushed to one letter per line (event "When"), found by looking at screenshots, not by assertions | Dynamic Type to 200% with no truncation or overlap | Rows wrap their value onto its own line; `overflow-wrap: break-word`; new assertion for crushed labels |
| 21 | Med | At 200%, navigation-bar actions ("Add race") were squeezed by the hidden compact title | Same | Action area never shrinks; title takes the leftover space |
| 22 | Med | Calendar month arrows were 34pt wide | Hit targets ≥ 44×44pt | `.btn` has `min-width: 2.75rem`; executable 44pt test on 11 phone screens |
| 23 | Med | Loading skeletons caused layout shift (CLS 0.068) | Stability; Lighthouse CLS | Skeleton screens removed; fixed-position navigation progress bar and pending submit buttons instead (CLS 0 on all screens) |
| 24 | Low | No in-app privacy notice | Privacy transparency | Member-only Privacy screen, linked from Settings |

### Evidence
| Area | Result |
|---|---|
| axe-core (WCAG 2.0/2.1 A + AA), serious/critical | **0** on 18 screens × iPhone and desktop, light, **dark** and **200% text** |
| Dark Mode | semantic tokens; contrast checked by axe on 14 screens; PNGs saved per run |
| Large text 200% | no horizontal overflow, no clipped or crushed labels, content clear of the tab bar on 14 screens |
| Touch targets | every button/link/field ≥ 44×44 on 11 phone screens; switches and chips sized by their whole row/pill |
| Reduce Motion / Increase Contrast / forced colours | animation and transitions removed; `prefers-contrast: more` darkens text and borders; controls stay visible in forced colours |
| Keyboard | skip link, sheets open/close from keyboard, Esc closes, visible 3px focus ring |
| PWA contract | `display: standalone`, start/scope `/`, 192/512/maskable PNG icons, 180px apple-touch-icon, light/dark `theme-color`, `apple-mobile-web-app-capable`, `viewport-fit=cover`, **zoom not disabled** |
| Lighthouse mobile (production build) | performance **94–99**, accessibility **100**, best-practices **100**, CLS **0**, LCP 1.6–2.6 s, TBT 90–220 ms on login, home, events, directory, calendar, me, admin |

### Justified, not fixed
1. **No per-device splash images** (`apple-touch-startup-image`): iOS generates the launch screen from the manifest background colour and icon; ~20 image sizes would be high-maintenance for no functional gain.
2. **No service worker / offline mode**: authenticated member data is deliberately never cached on the device (D-33). Installation on iOS does not need one.
3. **Haptics**: not available to web apps; none are faked.

### Accessibility audit
- **VoiceOver**: landmarks (`nav`, `main`), skip link, labelled controls, `aria-current` on navigation, `aria-pressed` on RSVP choices, `role=status/alert` for form feedback, decorative icons `aria-hidden`, calendar days read in full ("Monday 30 November, 2 items"). Not tested with a real screen reader; covered by axe and semantic review. Recommend a 15-minute VoiceOver pass on a device before inviting members.
- **Dynamic Type**: `font: -apple-system-body` on iOS, all sizes in `rem`; verified to 200%.
- **Contrast**: AA everywhere (tint on white 6.3:1, dark tint 9.9:1); Increase Contrast supported.
- **Motor**: ≥ 44pt targets, no gestures without button alternatives (pull-to-refresh is additive), no timed input.
- **Motion**: all animation neutralised under Reduce Motion.
