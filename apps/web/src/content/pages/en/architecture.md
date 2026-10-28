Most file tools ask you to take “we don’t keep your files” on trust. This page explains how Mochifile is built, so you can check the claim against the design instead of the promise.

## The short version

Browser tools open your file, process it and save the result inside your own browser tab. The file is never uploaded: it is not sent to us, queued, stored or used to train anything. No tool needs a server today. If one ever does, it will be marked before you start.

## Why there is nothing to delete

The strongest privacy guarantee is not a deletion policy; it is having no copy in the first place. Because browser tools never send your file anywhere, there is no upload folder, no processing queue and no bucket of originals waiting to be cleaned up.

This is a deliberate trade-off. It means your device does the work, so very large files are limited to protect phones and older computers.

## How a browser tool works

- **A separate worker.** Each job runs in a Web Worker, away from the page, so the page stays responsive and the job can be cancelled.
- **WebAssembly encoders.** Images are encoded with open-source codecs compiled to WebAssembly (mozjpeg for JPG, libwebp for WebP, oxipng for PNG), so every browser produces the same result.
- **Downloaded once, from us.** The engine is served from Mochifile’s own domain and cached. No third-party scripts run on tool pages.
- **Hidden details removed.** Results are re-encoded from the pixels, so they carry no EXIF, GPS, XMP or text metadata.

## The page cannot send your file elsewhere

Every page is served with a strict Content Security Policy. Among other things, `connect-src 'self'` means the page can only talk to Mochifile’s own domain, so even a bug could not quietly send your file to another site. This is the policy, as sent by the server:

<pre class="csp-policy">default-src 'self'; script-src 'self' 'wasm-unsafe-eval' &lt;hashes&gt;;
style-src 'self' &lt;hashes&gt;; img-src 'self' data: blob:; font-src 'self';
media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:;
manifest-src 'self'; object-src 'none'; base-uri 'self';
form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests</pre>

<p class="note">You can see it yourself in your browser’s developer tools, under the response headers of any page.</p>

## Limits that protect your device

- Compress image accepts up to 20 photos at a time, 50 MB each.
- Images over 100 megapixels are refused before they are opened.
- Work happens at most at 16 megapixels and one file at a time per worker, and memory is freed right away.

## Future tools that may need a server

Some tools we may add later, such as AI features, could not run in a browser. None exists today. If one is added, its page will say so before you start, and this page will describe how it handles your files before it launches.

## What we do record

- **No file data.** We never log file contents, file names or anything derived from them. Errors are reduced to codes.
- **No tracking cookies.** If we add analytics, they will be cookieless, aggregate and free of personal data.
- **Accounts.** When accounts launch: your email address, your plan and how many operations you used this period.

## What you can verify yourself

- Open your browser’s network tab while a tool runs: your file is not sent anywhere.
- Read the Content Security Policy in the response headers.
- Read the code on [GitHub](https://github.com/mochifile/mochifile). The site and the browser tools are open source.

<p class="note correction">If anything on this page turns out to be inaccurate, we would rather hear about it than not. Corrections to <a href="mailto:security@mochifile.com">security@mochifile.com</a>.</p>
