# 0031. Ask Mochifile: the concept page and its one script

- **Status:** Proposed in the draft PR for `feat/ask-v2`; Accepted on merge
- **Date:** 2026-10-28

## Context

The V2 canvas has an "Ask Mochifile" page (artboard MFFlow): a prompt box where people describe
what they need, suggestion chips, example cards and the mascots. The design README calls it a
concept, not a live assistant, and the maintainer asked for the whole interface, visual first,
without the engine. [AGENTS.md](../../AGENTS.md) rule 5 allows no JavaScript outside the tool
island except the language suggestion, and the Never-do list forbids uploading or logging files.

## Decision

- **Everything drawn, nothing processed.** The page shows every element of the artboard in
  English at `/ask/` and Portuguese at `/pt/pergunte/`, light theme only. No request leaves the
  page, and nothing is sent, read or answered.
- **Local interactions only.** A suggestion chip, an example, or the "In English" / "Em português"
  chips writes a sentence into the text box. "Add files" is the browser's own file picker; the page
  shows how many files were chosen ("2 files on your device"), never their names, and never reads,
  stores or sends them.
- **"Coming soon" for the rest.** Send, Help, "Paid plans" and the languages with no sample
  (Español, Français, हिन्दी, 简体中文) open the same declarative popover notice as the shell's
  controls, so they work without a script. Those four languages stay without a sample sentence
  until a native speaker writes one (the design README asks for that review).
- **One small page script.** Writing a sentence into the box and updating the file count need
  JavaScript. It is a page-scoped module (served from the site's own origin, so the CSP is
  unchanged), loaded only on the two Ask pages, and without it the page is complete: the box takes
  text, the picker opens, the notices work. This is a narrow exception to rule 5, not a site-wide
  script.
- **Page-scoped stylesheet.** Like the home and pricing pages, `styles/ask.css` spells out the
  canvas values that are not tokens yet, under `--ask-*` names, and is allowed raw values by the
  design guard until the shell's tokens land.

## Consequences

- The copy says what the page is: a concept that is planned for the free plan, where Mochifile is
  "meant to" work out formats, sizes and settings. The hero lead still describes the idea in the
  canvas's words; revisit it when the page is linked from the navigation.
- When the assistant exists, Send gets a real handler and a privacy review (what leaves the
  device); the notice and the "concept" notes go away.
