The file drop area: the heart of every tool page, with a big button so phones never need to drag.

- `surface-sunken` ground, 2.5px dashed `border-dashed`, squished `radius-xl`, generous padding; on desktop it takes the wider column of the tool panel.
- Contents, centred: optional `mascot-idle` (desktop), a numbered step label in `title-sm` ("3. Choose your photos"), a primary `action` button ("Choose photos") that opens the file picker / gallery, and a `body-sm` `ink-muted` line with accepted formats and limits.
- Drag-over: border becomes solid `ink`, ground `mango-tint`, and the squish animation plays once.
- The real `<input type="file">` is visually hidden but keyboard reachable through the button; paste (Ctrl+V) is supported and mentioned on desktop.
