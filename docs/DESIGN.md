# Scholars Syndicate — design system

Direction (set by the owner from a Dribbble reference): **simple, engaging, modern**, mobile-first. The reference's _style_ is
borrowed (banner, overlapping avatar, soft cards, one strong blue action); none of its photos, logos or text are used.

## Palette (CSS variables in `apps/web/src/styles.css`)

| Token       | Light     | Dark      | Used for                                      |
| ----------- | --------- | --------- | --------------------------------------------- |
| `--brand`   | `#2347e8` | `#7f9bff` | main actions, links, progress                 |
| `--banner`  | `#6d2fd9` | `#4a259c` | the purple header banner                      |
| `--bg`      | `#f2f3fb` | `#0c1022` | page background (soft lavender)               |
| `--surface` | `#ffffff` | `#161b36` | cards                                         |
| `--text`    | `#111a3a` | `#eef0ff` | headings and body                             |
| `--muted`   | `#5b6475` | `#a8b0cc` | hints, secondary text                         |
| `--tone-*`  | pairs     | pairs     | icon tiles: blue, pink, orange, green, purple |

White text on `--brand` and on `--banner` passes WCAG AA (about 6.7:1 and 6.9:1). In dark mode the brand colour is light, so
filled buttons use dark text there. Dark mode follows the phone setting; there is no manual switch yet.

## Building blocks

- **Cards:** `.card` (and `.home-card`): 1.25rem radius, soft shadow, no hard border.
- **Buttons:** filled blue (default `button`) for the one main action on a screen; `.btn-outline` / `.btn-secondary`
  (outlined pill) for everything else. All keep a 44px minimum touch height.
- **Banner:** `.hero` — purple with a honeycomb pattern drawn as a ~550-byte inline SVG (no image download).
- **Avatar:** `.home-avatar`, 92px, sits half on the banner. Needs `position: relative; z-index: 1` or the banner paints over it.
- **Icons:** `apps/web/src/icons.tsx` — hand-drawn inline SVG line icons, decorative (`aria-hidden`).
- **Tab bar:** `TabBar.tsx` / `.tabbar` — fixed to the bottom, Home and Account, `aria-current="page"` on the open tab, safe-area
  padding for phones. The open tab lives in the address bar (`#home`, `#account`, see `nav.ts`) so Back, refresh and shared links work,
  and focus moves to the new screen's heading when the tab changes. Add a tab only when its screen really exists.
- **Account cards:** `.account-card` with an icon tile, a heading, one sentence and one action. The danger card uses `.tone-red`
  and a red border; the dangerous action is `.btn-danger` (filled red) and only appears after a deliberate first click
  (`.btn-danger-outline`), never as the first thing a person can tap.
- **Notices:** `.notice` — a soft blue message with an optional "Got it" button, used for "Welcome back, deletion cancelled" and
  "Your account is scheduled for deletion". Announced to screen readers with `role="status"`.
- **Progress:** `.progress-track` / `.progress-fill`, exposed as `role="progressbar"` with `aria-valuenow`.

## Rules

1. **Data-light.** No photos, icon libraries or web fonts without a clear reason. The system font stack is deliberate. Every
   addition to the first load is measured (this step added about 3 KB gzipped in total).
2. **No dead controls.** Do not show a button, tab or card for something that does not exist yet. (The reference's "Add details"
   buttons are not built because the profile cannot be edited yet; its bottom tab bar appeared only once Account gave it two real
   destinations.)
3. **Honest numbers.** Progress and summaries come from real saved data, never placeholders.
4. **Quiet failures for optional extras.** If the journey cannot load, the home screen still works and shows no error.
5. **Accessibility stays on:** visible focus, `prefers-reduced-motion` respected, headings in order (one `h1`), contrast as above.
6. Keep `prefers-color-scheme` dark values for every new colour.
7. **Nothing may hide behind the fixed tab bar.** `html { scroll-padding-bottom }` keeps anything the browser scrolls into view
   (keyboard Tab, a jump to an error) clear of it. Anything that appears below the fold after a tap (a form, an error that makes a
   form taller) must also be scrolled into view with `scrollIntoView({ block: 'nearest' })`, receive focus when it opens, and hand
   focus back to the control that opened it when it closes.
8. **Confirm every reversal on every signed-in screen.** The person may land on any tab, so a message that says something
   important (for example "your account deletion has been cancelled") lives in a shared component (`WelcomeBackNotice`), never
   inside one screen only.

## Checking it by eye

The website tests check structure and behaviour, not looks. To see a screen: build (`npm run build -w @scholars/web`), serve
`apps/web/dist` with any fake API, and open it at phone width (about 390px), in dark mode, and at laptop width.

## Not designed yet

Editable profile ("Add details" on the home cards, reusing the journey wizard), teacher and admin screens (the question review
screen first), and the restyle of the onboarding screens (they only inherit the new colours, cards and buttons for now).
