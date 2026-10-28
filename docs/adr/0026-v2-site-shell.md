# 0026. The V2 site shell: header, phone menu, footer and "Coming soon" controls

- **Status:** Proposed in the draft PR for `feat/v2-header-footer`; Accepted on merge. It amends
  [ADR 0023](0023-phone-menu-with-the-popover-api.md) (what the menu lists) and
  [ADR 0024](0024-lettered-wordmark.md) (the wordmark files and size)
- **Date:** 2026-10-27

## Context

The maintainer approved the Mochifile V2 design (the "Site final" canvas, exported to
`docs/design-ref/v2` locally and not committed): a light-only site with a cream page ground, a header with Solutions ·
Guides · Docs · Pricing · Sign in · Get started, a phone menu, and a footer drawn on the page
ground instead of an ink block. The rule for this step is *visual first*: every element in the
artboards appears, even when its service does not exist yet, but nothing pretends to work.
Where the exported README disagrees with the maintainer's instructions, the instructions win:
a language selector in the header and the footer, GitHub as the only social network, and a
"Made with ♥ by RaioViajante" credit.

## Decision

- **Tokens.** `tokens.json` gains the canvas's colours (`accent`, `accent-soft`, `card-line`,
  `dot-red`, `dot-green`, `heart`), two sizes (`site-header` 84px, `site-max` 1104px) and the
  "Site shell" type styles. Shadows, the "mochi squish" radii and a few measured spacings are in
  `component-constants.css`, each citing the canvas. The new colours have dark values only so
  every token is complete; V2 is light-only and no dark theme or theme switch is designed.
- **Wordmark.** The official lettering files replace the masters named in ADR 0024
  (`mochifile-wordmark-light.png` is now `logo-official-dark.png`, ink letters, 1800 × 333 px;
  `-dark` is `logo-official-cream.png`, 1908 × 353 px). The site still ships 368 and 552 px
  copies; the logo is 151px wide (28px tall) in the header and the footer no longer shows it.
- **Header and menu.** Under 1024 px the links, buttons, the language chips and the approved
  "happy" mascot sit in the Popover API menu of ADR 0023; from 1024 px the links are in the
  header with a language button that opens a Popover list of the six languages.
- **Footer.** Three link columns, the two pills, company and legal links, the language row, the
  credit, a GitHub icon, the "Open source" and "Sponsor" badges and the "Ask AI" line, as drawn.
  Only GitHub is shown as a social network (the canvas also has X and TikTok). One link is
  added: "Open-source licenses" (`/third-party-licenses.txt`) below the "Ask AI" line, because
  that notice must stay reachable.
- **Coming soon, without a script.** A destination or service that does not exist is a native
  `<button>` (`ComingSoon.astro`) that opens a declarative popover notice (`role="status"`,
  fades after 4s, closes on Escape or the next press). Its accessible name ends with ", Coming
  soon" and it has a tooltip. Nothing links to `#` or to a page that does not exist. Real pages
  (Compress image and its 50 KB page) are linked from the registry. Giving an entry in
  `lib/site-nav.ts` an `href` turns it into a link when its page ships. "Ask AI" and "Sponsor"
  stay controls of this kind: there is no sponsorship page, and a prompt aimed at an
  unlaunched site (ADR 0014) would send people to a wrong answer.
- **Languages.** English and Portuguese are links to the page's alternate (ADR 0007), no
  redirect by browser language. Español, Français, हिन्दी and 简体中文 are shown in their own names and
  marked "Coming soon". Their text uses the fallback faces until a locale ships (ADR 0021).
- **Shadows.** The canvas uses soft tinted shadows on cards, pills and badges, which the v1 brand
  book forbade. They apply to these shell surfaces only.

## Consequences

- AGENTS.md rule 5 still holds: no new script. The shell adds popovers, which work in every
  engine the e2e suite runs; without the Popover API the menu is in the page flow and the
  language button is hidden (the footer lists the languages).
- The existing dark tokens and the themed wordmark selectors stay untouched; they are not part
  of V2 and can be removed in a separate change when that is decided.
- The sizes `site-header` and `site-max` apply to the header and footer only; pages keep
  `content-max` until their V2 pages land.
