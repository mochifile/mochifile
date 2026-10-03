# Mochifile

Friendly, privacy-first file tools for everyone. Mochifile shrinks, converts and fixes everyday files (photos, videos, PDFs) right in the browser, for people who have never heard the word "compression".

This is the single source of truth for how Mochifile looks, sounds and behaves. Agents (Claude Code, Codex) and contributors implement from this system: use the tokens by name, follow the rules below, and never invent a colour, size or radius that is not here. If something is missing, ask for it to be added instead of improvising.

**Status:** v1. Colours, type, spacing, radius, dark theme and core components are settled. The logo and mascot are **provisional** (see *Logo* and *Mascot*).

## Essence

**The tool is serious, the brand is sweet.** Choosing a file, picking a size and downloading must feel as direct as a good utility: nothing in the way. Personality lives at the edges: waiting, processing, success, error, empty pages.

Four principles, in priority order:

1. **Obvious first.** A layperson on a phone must finish the task without reading instructions. One primary action per step.
2. **Honest.** Never promise what the tool does not do. Say when a file leaves the device (AI tools). Show the real result ("3.5 MB → 48 KB").
3. **Calm.** Generous space, few elements, no urgency tricks, no dark patterns.
4. **Soft, like mochi.** Rounded, slightly squished shapes, vivid warm colour blocks, a gentle bounce.

## Voice and tone

Mochifile talks like a helpful friend who happens to be good with computers. Short sentences, plain words, no jargon, no blame.

| Situation | Do | Don't |
|---|---|---|
| Primary action | "Choose photos" · "Escolher fotos" | "Upload assets" |
| Success | "Ready! It fits your 50 KB limit." · "Pronto! Cabe no seu limite de 50 KB." | "Operation completed successfully." |
| Error | "This file is too big to open here. Try a smaller copy." | "Error 413: payload exceeds limit." |
| Privacy | "Your photos never leave your device." | "We use client-side WASM processing." |
| Impossible target | "The smallest we could make is 7 KB." | "Target unreachable." |

Rules: name tools as **verb + object** ("Compress image", "Merge PDF"), because that is how people search. Celebrate results with numbers. In errors, always say what to do next. Translate meaning, not words, and keep the same warmth in every language. Portuguese copy is Brazilian Portuguese ("arquivo", "celular").

## Colour

Two themes, `light` (default) and `dark`, switched by `data-theme` and following the system setting. Every value below is a token: use `var(--token-name)`, never a raw hex.

**Grounds:** `surface-page` is the page. `surface-card` holds the tool panel, cards and inputs. `surface-sunken` is inside the dropzone. `surface-inverse` is the ink band (privacy band, footer, code).

**Identity blocks:** `mango`, `strawberry`, `matcha`, `ube`, named after mochi flavours. They are used as big solid blocks, Headspace-style, never as thin accents or text colours. Text on any block is always `ink-on-block`. Category mapping:

- **Image** tools → `mango` (block) / `mango-tint` (icon tiles, chips)
- **Video and audio** → `ube` / `ube-tint`
- **PDF** → `strawberry` / `strawberry-tint`
- **Success** → `matcha` / `matcha-tint` with `matcha-ink`

**One action colour.** Every primary button is `action` with `action-ink`: an ink pill in light, a cream pill in dark. Never make a primary button mango, strawberry or any brand colour: blocks are for identity, ink is for doing.

**States:** errors use `danger`, `danger-tint`, `danger-ink` only. **Strawberry never means error**: it is a brand colour. Attention uses `warning-tint` / `warning-ink`. Keyboard focus uses `focus-ring`: a 3px outline with 2px offset on every interactive element, never removed.

**Borders:** `border-control` for anything whose border identifies it as a control (unselected chips, outline buttons, inputs). `line` only for decorative dividers. `border-dashed` only for the dropzone.

**Dark theme:** blocks stay vivid (slightly deepened); text on blocks stays ink. Tints become deep, low-light versions with light ink. The mascot keeps its colours and always sits on a block or a light disc, never directly on the dark ground.

All text pairs meet WCAG AA (4.5:1, 3:1 for 24px+) in both themes; control borders and the focus ring meet 3:1.

## Typography

- **Display: Fredoka** (Google Fonts), weights 500–700. Headings, button labels, numbers in results ("48 KB").
- **Text: Figtree** (Google Fonts), weights 400–700. Body, UI labels, chips, notices.
- **Code: JetBrains Mono.** API page only.
- **Fallback: Noto Sans** for scripts Fredoka/Figtree lack (Devanagari, Arabic, CJK). Always keep it in the stack.

Use the type styles by name (`display-xl` … `caption`). Body copy is never smaller than 16px; hints never smaller than 14px. On screens under 600px, step headings down one level (`display-xl` → `display-lg`). Never use Inter, Roboto or Arial as a design choice.

## Shape: the squish

Mochifile has no sharp corners. Radii come from the `radius-*` scale. Large surfaces (blocks, the tool panel, chips) use a **squished** radius: the four corners differ by 2–6px around the token, for example `radius-xl` 34px becomes `34px 38px 32px 40px`. This tiny irregularity is the brand's signature. Rules:

- Squish **blocks, the tool panel, chips, cards and the dropzone**. Do not squish buttons (always `radius-pill`), inputs or tags.
- Vary the pattern between neighbours so a grid of cards does not look stamped.
- No drop shadows. Depth comes from colour: card on page, page on block.

## Layout and spacing

- Spacing from the `space-*` scale only. Sections are `space-16` apart; cards in a grid `space-4`.
- Content max width `content-max`; long reading text `reading-max`.
- Every tappable thing is at least `target-min` (44px). Primary buttons and the search field are `target-primary` (56px).
- Mobile first. The tool panel always starts above the fold on a phone.
- Ads never appear inside or between the tool's controls and its result. They go after the result or beside the long-form content, in a reserved slot so nothing shifts.

## Page patterns

- **Tool page:** coloured hero block (category colour) with breadcrumb, H1 and one-line purpose → white tool panel overlapping the block (1. size / options, 2. format, 3. dropzone) → results → long-form content (How it works, FAQ) → "Other sizes" links → footer.
- **Home:** search first ("What do you need to do?") with popular shortcuts → "Most used" as big colour blocks → all tools grouped by category with filter chips → privacy band (`surface-inverse`) → Premium block (`strawberry`) → footer.
- **Mobile catalogue:** categories become collapsible lists; never an endless card grid.

## Mascot

A soft mochi shaped like a document: rounded body in `mochi-body`, a folded top-right corner in `ube`, dot eyes, `mochi-blush` cheeks, outline in `mochi-outline`. Files are in *Assets › Mascot*.

| State | When |
|---|---|
| `mascot-idle` | Empty dropzone, heroes |
| `mascot-squish` | Processing (with the progress bar) |
| `mascot-happy` | Result ready |
| `mascot-error` | Errors and the 404 page; the text beside it always says what to do |

Rules: the mascot reacts, it never talks in speech bubbles and never blocks a control. Maximum one mascot per screen region. **Provisional:** the current drawings are working vectors; a final model sheet (fixed proportions, expression set) and the mascot's name are pending.

## Logo

- **Symbol:** the mascot's silhouette with eyes only (*Assets › Logos*). Used as favicon, avatar and next to the wordmark.
- **Wordmark:** "mochifile" in lowercase, Fredoka 700, with the dots of both i's replaced by small squished mochi drops: the first `strawberry`, the second `matcha`.
- Always write the name as **Mochifile** in text and **mochifile** in the wordmark. Never "Mochi" alone (trademark rule).
- **Provisional:** the final wordmark will be redrawn as custom outlines; the 16px and 32px favicons need pixel-tuned versions. Until then, do not ship the wordmark as live text in places where the font may not load (emails, images).

## Iconography

Line icons on a 24px grid, 2px stroke in `ink`, round caps and joins, no fills except small details. On tool cards, icons sit in a `icon-tile` square with the category tint and `radius-md`. Never use emoji as icons. A full custom set drawn to match the mascot's stroke is pending; until then use simple line icons in this exact style.

## Motion

- **Press:** buttons and chips scale to 0.97 for 120ms.
- **Squish:** the mascot and the dropzone (on drag-over) flatten to 104% width / 96% height and spring back over 280ms with `cubic-bezier(0.34, 1.56, 0.64, 1)`.
- **Ready:** one bounce of the result card (translateY −6px → 0, 320ms, same curve).
- **Never** animate layout, never loop decoration, never delay a task for an animation.
- Under `prefers-reduced-motion: reduce`, all of the above become instant opacity changes.

## Accessibility

Real `<button>`, `<a>`, `<input>` + `<label>` always. Focus ring always visible. Colour is never the only signal (selected chips also get the ink border and bold label). Status changes (progress, ready, error) are announced with `aria-live="polite"`. Every page works with the keyboard alone and at 200% zoom.

## Don'ts

- No gradients, glassmorphism, neon or blue-purple "AI" palettes.
- No left-border accent cards, no emoji icons, no stock 3D blobs.
- No brand colour on primary buttons; no strawberry for errors.
- No text smaller than 14px; no grey text below 4.5:1.
- No ads between a control and its result.
