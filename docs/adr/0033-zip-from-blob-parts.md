# 0033. Build the "Download all" ZIP from Blob parts, without a library

- **Status:** Proposed
- **Date:** 2026-10-28

## Context

"Download all" (`packages/tool-ui/src/zip.ts`) built the ZIP with `client-zip` and then called
`Response.blob()` on its output. `client-zip` only stores files (no compression), so each entry is
the file's own bytes between two small headers; but it hands them over as a stream, and
`Response.blob()` collects the stream in memory before making the Blob. The archive existed
several times at once: as the chunks read from every result Blob, as the buffer that joins them,
and as the final Blob.

The pull request that raised the WebAssembly pixel limit (#51, see [ADR
0022](0022-heic-and-avif-decoding.md)) measured it in WebKit: about 3.5–3.9 times the ZIP's size,
+1.6 GB for a ZIP of 460 MB, and a download that was not returned. The future Convert image tool
makes this worse: its results are full-size PNG or JPG files, much bigger than the compressor's.

## Options considered

1. **Keep `client-zip` and `Response.blob()`.** The status quo; measured below.
2. **Keep `client-zip`, collect its chunks into the parts of a Blob.** Not measured. Every byte of
   every file still goes through JavaScript as chunk arrays and is copied again into the Blob, so
   it cannot be better than one extra copy of the archive.
3. **Write the archive to disk as it is built** (File System Access API, or a service worker that
   streams the download). Safari has no `showSaveFilePicker`, and a service worker is a new moving
   part with its own cache, update and CSP behaviour. Not worth it for these sizes.
4. **A Blob made of parts (chosen).** The archive is `new Blob([header, resultBlob, header,
   resultBlob, …, directory, end])`. The browser references the result Blobs; it does not copy
   them. Only the headers (a few hundred bytes per file) are new memory.

## Decision

We will build the ZIP ourselves, as a Blob of parts, and drop `client-zip`.

- **CRC-32.** Every ZIP entry carries the CRC-32 of its bytes, so each file is read once, in slices
  of 2 MiB (`blob.slice().arrayBuffer()`), with a table-driven CRC in "slicing by 8"
  (`crc32.ts`, tested against Node's `zlib.crc32`). Knowing the CRC and size beforehand, the local
  header is complete and no data descriptor is needed.
- **Format.** Stored entries, UTF-8 names (flag bit 11), MS-DOS timestamps, Unix permissions
  `rw-r--r--`, no extra fields. No ZIP64. Every size and offset in the headers is a 32-bit field
  whose largest usable value is 0xFFFFFFFE (0xFFFFFFFF means "see the ZIP64 record"), and the entry
  count is a 16-bit field with the same reserved value. So `createZip` accepts at most 65,534
  files, and only if the files, their headers and the central directory together end by byte
  4,294,967,294. For one big file that is a little under 4 GiB: its size plus 76 bytes plus twice
  its name's length in bytes (the two headers). Otherwise it throws a `RangeError`, **before
  reading any file** and without producing an archive. Today's limits (20 files of up to 50 MB
  each in, and results of similar size) are far below this. If a tool ever needs more, ZIP64 is the
  follow-up, tested with real tools.
- **Names (added after the first review).** The first version kept names as they were, apart from
  numbering exact repeats; a review showed that two different names can be the same file for the
  person extracting, and one overwrote the other in every extractor tried. `createZip` now names
  the entries itself, through `zipEntries`, so no caller can skip it. For each file, in order:
  1. *Clean.* `/` and `\`, the characters Windows refuses (`: * ? " < > |`; a `:` makes an
     alternate data stream there) and the control characters U+0000–U+001F and U+007F become `_`
     (the C1 controls, U+0080–U+009F, are kept); unpaired surrogates become U+FFFD; dots and
     spaces at the end are removed (Windows does, so `a.` and `a` would meet); an empty name, `.`
     and `..` become `file`; a name gets a `_` in front when the part before its first dot,
     without trailing spaces, is `CON`, `PRN`, `AUX` or `NUL`, or `COM` or `LPT` followed by one
     digit (0–9, or the superscripts ¹ ² ³), in any case and with any extension. The result
     cannot point to a folder, inside or outside the one extracted to.
  2. *Cut* to 255 UTF-8 bytes, by characters, keeping an extension of up to 16 bytes. The format
     allows 65,535 bytes, but the file systems people extract to allow 255 per name, and extractors
     fail on longer ones. A name over the limit used to be an error, now it is shortened.
  3. *Compare.* Two names are the same file if they are equal after Unicode canonical
     normalization (NFC), upper-casing, lower-casing and NFC again. That joins `Photo.JPG` and
     `photo.jpg`, `é` as one character and as `e` + a combining accent (macOS), `Å` and the
     angstrom sign, and `ß` and `SS`, `σ` `ς` `Σ`, the Kelvin sign (some tables join them, some
     do not). It joins more than any one system does, which only costs a number on a name that
     did not need one.
  4. *Number.* A name the same as an earlier one gets ` (2)`, ` (3)`… before its extension
     (`photo.jpg`, `photo (2).jpg`), the first number that no entry has, so numbering never makes a
     new collision, and the result is the same for the same list in the same order. The names are
     otherwise kept in their own form (an NFD name stays NFD). A name that is safe and not the same
     as any other name of the list is kept, **unless an earlier repeated name has taken it as its
     number**: numbering follows the order of the list, so `a.jpg`, `a.jpg`, `a (2).jpg` give
     `a.jpg`, `a (2).jpg`, `a (2) (2).jpg`, and the same names in another order can number a
     different file. The number is made to fit the 255 bytes.
- **Failures.** A file that cannot be read, or gives fewer bytes than its size, rejects
  `createZip`, and `downloadZip` creates no URL and clicks nothing. A ZIP that is wrong is never
  offered.
- **Dependency and loading.** `client-zip` is removed from `@mochifile/tool-ui` and from `SHIPPED`
  in `third-party-licenses.ts`. The builder (`zip-archive.ts`: names, CRC-32, headers) is still
  loaded on the first sign of intent (`preloadZip`, called when the tool prepares), as the library
  was, through a dynamic `import()` in `zip.ts`. It must stay that way: imported statically it ends
  up in the tool's first load (see Consequences). `zip.ts` forgets a failed load, so that its own
  state does not stay stuck, and a test checks that with the module mocked. Whether a second
  `import()` of the same chunk can then succeed is up to the browser: Chromium can keep the failed
  result for the life of the page, so there a reload may be needed. That was not tested in real
  browsers (same as before for `client-zip`) and is a follow-up.

## Measurements

Method. A page (no CSP) with the real `downloadZip` of each version (the old one built from `main`
at `71f6e27`, the new one from this branch) and N Blobs of incompressible bytes, as the tool's
workers hand over results. Playwright 1.63.0 with WebKit 26.6 and Chromium 153.0.8010.12 (headless
shell), macOS 27.0.1, Apple M5, 24 GB. Memory is the sum, over every process of that browser, of
`phys_footprint` (`footprint`) and of RSS (`ps`), sampled about every 150 ms; "added" is the peak
minus the median before the call (3 s after the Blobs were made). Time is from the call to the click
and to the end of the download; "stall" is the longest delay of a 10 ms timer, the main thread being
busy. Every archive was downloaded and checked with `unzip -t`, Python's `zipfile.testzip()` and the
SHA-256 of each file against the one computed outside the browser. Three runs of each case (one for
1 GB and 2 GB); the ranges are the lowest and highest.

| Case (20 files) | Browser | Version | Added at peak (footprint) | × ZIP | Added 3 s later | Build → click | Stall |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 460 MB | WebKit | old | 2,281–3,180 MB | 5.0–6.9 | 2,186–2,623 MB | 1.2–1.7 s | 58–64 ms |
| 460 MB | WebKit | new | 258 MB | 0.56 | 254 MB | 0.38–0.40 s | 3–4 ms |
| 460 MB | Chromium | old | 515 MB | 1.12 | 511 MB | 1.1 s | 10–17 ms |
| 460 MB | Chromium | new | 171–204 MB | 0.37–0.44 | 90 MB | 0.47–0.48 s | 3–4 ms |
| 100 MB | WebKit | old | 592–597 MB | 5.9 | 201 MB | 0.28–0.30 s | 13–16 ms |
| 100 MB | WebKit | new | 104 MB | 1.04 | 100 MB | 0.12 s | 3–4 ms |
| 100 MB | Chromium | old | 125 MB | 1.25 | 125 MB | 0.26 s | 8 ms |
| 100 MB | Chromium | new | 61–65 MB | 0.6 | 54 MB | 0.18 s | 3–4 ms |
| 1 GB | WebKit | new | 536 MB | 0.54 | ~0 | 0.8 s | 3 ms |
| 1 GB | Chromium | new | 293 MB | 0.29 | 187 MB | 0.87 s | 3 ms |
| 2 GB | WebKit | new | 1,124 MB | 0.56 | ~0 | 1.5 s | 3 ms |

What the table says, and does not say:

- **The old code finished the 460 MB download here**, unlike the earlier measurement of #51. The
  difference of memory is the finding that stands: in WebKit the old code needed 5 to 7 times the
  ZIP's size (2.2 GB in the page's process and 0.9 GB in the network process), and still held 2.2 GB
  or more 3 s later.
- **The new code does not use constant memory.** In WebKit it adds about 0.55 times the archive's
  size, in Chromium 0.3 to 0.4. What accumulates is not the archive (the Blobs are referenced) but
  the `ArrayBuffer`s the CRC reads, which wait for the garbage collector: after the 1 GB and 2 GB
  runs WebKit was back at its starting memory, and the 100 MB run kept all 100 MB because no
  collection had been needed yet. The slice size does not change it (256 KiB to 8 MiB: 247–278 MB
  at 460 MB in WebKit; 256 KiB is 45% slower, 8 MiB more than doubles the stall, 2 MiB was kept).
  Reading with `blob.stream()` is worse in WebKit (415–438 MB).
- **Releasing each slice with `ArrayBuffer.prototype.transfer(0)` was tried and rejected.** In
  WebKit it cuts the 460 MB case from 258 MB to 6 MB, but in Chromium it raised it to +944 MB in
  three out of three runs (the browser process held about one more copy of the archive). A trick
  that helps one engine and hurts another, and needs engine detection, is not simpler than the
  problem.
- **JavaScript heap** (Chromium only, `performance.memory`, peak during the call): 30–32 MB with
  the old version and 36–38 MB with the new one. The slices are `ArrayBuffer`s, which are not
  counted there. WebKit does not expose it.
- **2 GB in Chromium is inconclusive.** The headless shell could not read back its own 2 GB of
  in-memory Blobs, without any ZIP involved (`NotReadableError` at 48 MB into the first file); the
  old version failed in the same way (`Failed to fetch`). 20 × 50 MB works.
- **Not measured:** Firefox (it does not start in the development machine's sandbox; its behaviour
  is covered by the end-to-end tests in CI, not by memory numbers), phones, a real Compress image
  batch (the Blobs here come from the page, not from a worker's `postMessage`), disk use, and
  iOS Safari's own limits for large downloads.

## Consequences

- **Less memory, by a factor of about 10 in WebKit and 2 to 3 in Chromium, and faster** (3 to 4
  times in WebKit), with the same bytes: the e2e tests read the downloaded ZIP and compare each
  entry with the file's own download.
- **The memory still grows with the archive, about half its size in WebKit.** That is what a
  Convert image batch of several hundred megabytes will cost on top of the results themselves
  (which are in memory as Blobs anyway). The honest limit on a phone is unknown until one is
  measured; a cap on a batch's total size, or building the ZIP per group of files, are the next
  levers and need those numbers.
- **What the names do not promise.** The policy covers the common ways two entries meet on
  Windows, macOS and Linux file systems; it does not claim every file system. Not handled: Unicode
  code points some systems ignore in names (HFS+ drops some default-ignorable ones, such as zero
  width joiners), compatibility equivalents (fullwidth letters stay different, as they are on
  disk), the rest of the Windows reserved words (`CLOCK$`, `CONIN$`), a path that is too long for
  Windows (260 characters in total: only one name is limited), names that look alike but are
  different (a right-to-left override character is kept), and a person's own folder already
  holding files of those names (extractors ask or overwrite as they always do). Names inside the
  ZIP can differ from the ones of the individual downloads (`Screenshot 14:31.png` is
  `Screenshot 14_31.png` in the ZIP); the individual download keeps its own name. Which of two
  files gets the number depends on their order in the list.
- **Names that start with `._`, and C1 controls.** `._name` is how macOS stores the metadata of a
  file on volumes that cannot (AppleDouble). Tried here with `._a.jpg` and `._lonely.jpg` in a
  ZIP: `ditto -x -k` (what the macOS Archive Utility uses) wrote neither, without an error,
  while `unzip`, `bsdtar` and Python wrote both. The policy keeps such names (they are not a
  collision and are legal names), so a result file called `._…` may not appear when a ZIP is
  extracted with the macOS built-in tool; photos are not normally called that. The C1 controls
  (U+0080–U+009F) are not replaced: only U+0000–U+001F and U+007F are. The four extractors wrote
  them, invisible, and that is all that was checked; some tools show or handle them badly. Other
  invisible characters (zero width, bidirectional marks) are kept too. Neither case was
  changed, and both are open follow-ups.
- **The CRC runs on the page's main thread**, in slices (3–4 ms of stall measured at 460 MB, 1 GB
  and 2 GB). Moving it to a worker is possible (Blobs are posted by reference) but costs a second
  worker bundle for a few milliseconds; revisit if a slower device shows jank.
- **A failure of "Download all" is still silent**: the button's handler does not show an error
  (it did not before). Nothing is downloaded, which is the safe outcome; the message needs a
  string in every language and a place in the V2 panel, so it is left as a follow-up.
- One dependency fewer to keep, update and ship: its notice leaves `/third-party-licenses.txt`.
- **The builder must load on demand, and the margin of the JavaScript budget is small.** The e2e
  test limits the JavaScript sent before any interaction on `/compress-image-to-50kb/` to 90 KiB
  (92,160 bytes) gzip, with Save-Data and nothing hovered. It was measured twice, by two people,
  on production builds, and **the two series do not agree and were not reconciled**. Both are
  recorded; neither is taken as the true figure.

  | Version | Series A (author) | Series B (independent review) |
  | --- | --- | --- |
  | `main` (`71f6e27`) | 88,004 | 91,180 |
  | first version of this change (`db358ba`), builder imported statically | 88,970 | 92,014 |
  | with the names added, still imported statically | 92,450 | 92,450 |
  | builder loaded on demand (`3512466`) | 87,886 | 91,042 |
  | margin to 92,160, last row | 4,274 | 1,118 |

  *Series A:* Chromium 153 with Save-Data; `astro build --outDir dist-e2e` rebuilt for each commit
  and served with `apps/web/e2e/serve.ts`; wait for the file input, then 3 s; the sum of the gzip
  size of every `.js` response, by a script that copies the test's logic, not by the test; five
  runs of a build gave the same bytes. *Series B:* the official method, the e2e test's own
  measurement, as reported by the review; its build and environment were not recorded here.
  The author read `main` three times: 85,028 once, with a chunk set that matched no build
  identified afterwards (not used); then 91,180, the same as series B, on a bundle built hours
  earlier; and 88,004 after rebuilding the same commit. The two bundles split the tool's code
  into different chunks (in the larger one the Paraglide runtime and `jsx-runtime` are separate
  chunks requested before interaction). Why two builds of the same commit split differently was
  not found, and it may be what separates the two series by about 3.1 KB.

  What both series say: with the names and the builder imported statically the page went over the
  budget (92,450 in both); with the builder loaded on demand it is under the budget and lower
  than `main` (118 bytes lower in A, 138 in B); the first version was above `main` (966 bytes in
  A, 834 in B), and left a margin of 3,190 bytes in A and 146 in B. The margin of the current version is
  between 1,118 and 4,274 bytes, depending on the series. (An earlier figure in this ADR, "1.5 KB
  less JavaScript", was the total of every chunk of the site, which is not what loads first.)
  `zip.ts` is a small facade with a dynamic `import()` for that reason. Watching this budget is a
  follow-up.
- A ZIP writer of our own is a small piece of code to maintain. It writes one fixed shape of
  archive, and it is covered by a reader written separately in the tests, by Node's CRC-32, and
  by `unzip` and Python when they are installed (CI runners and developer machines). The names are
  also tested by extracting archives of colliding names with `unzip`, `ditto`, `bsdtar` and Python
  (the first three where they exist), on a case- and normalization-insensitive volume on macOS.
