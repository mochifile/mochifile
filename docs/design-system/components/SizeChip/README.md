Selectable chips for picking a target size, format or filter; a squished, tappable option.

- Unselected: `surface-page` fill (on a card) or `surface-card` (on the page), 2px `border-control`, `ink` label in `body-sm` weight 600.
- Selected: category block colour fill (`mango` for image tools), 2px `ink` border, label weight 700. The ink border and bold label make the selection clear without colour.
- Semantics: a single choice among options is a **radio group** (real
`<input type="radio">` under a styled label, inside a `fieldset`/`legend` or
`role="radiogroup"`), so arrow keys move the choice and the checked state is
announced. Use `aria-pressed` only for independent on/off toggles, such as filter
chips that can be combined.
- Height ≥ `target-min`, squished radius around `radius-md` (e.g. `16px 18px 15px 19px`), gap `space-2`, wraps freely.
- Segmented variant (format: Original / JPG / WebP): a `surface-page` track with `radius-md`; the selected segment is `action` with `action-ink`.
