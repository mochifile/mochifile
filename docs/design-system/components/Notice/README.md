Short status tags and notices that explain what happened to a file, colour-coded by meaning.

- **Tag** (one fact): `radius-pill`, `body-sm` weight 600, tint ground + matching ink: success `matcha-tint`/`matcha-ink` ("Metadata removed"), info `ube-tint`/`ube-ink` ("Saved as JPG"), attention `warning-tint`/`warning-ink` ("Resized"), error `danger-tint`/`danger-ink`.
- **Notice** (a sentence and maybe an action): same pairs, `radius-lg`, padding `space-4`, an icon on the left; errors always say what to do next.
- Never use strawberry for errors. Announce new notices with `aria-live="polite"`.
