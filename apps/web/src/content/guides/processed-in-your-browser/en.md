---
slug: processed-in-your-browser
title: What “processed in your browser” really means
summary: How browser-only tools work and how you can check that nothing is uploaded.
topic: privacy
spotlight: pick
---

“Processed in your browser” means your file is opened, changed and saved on your own phone or computer. Nothing is sent to a server, because there is no server step to send it to.

## How it works

When you add a photo, the page hands it to a small program running in your browser. That program does the work and gives the result back to the page, which offers it as a download. The original and the result both stay on your device.

## Why it matters

A tool that uploads your file has to be trusted to delete it, to keep it safe in the meantime and to never look at it. A tool that never receives the file has nothing to delete and nothing to leak. That is the idea behind Mochifile's browser tools.

## How to check it yourself

1. Open your browser's developer tools (usually F12, or right-click and Inspect) and go to the **Network** tab.
2. Add a photo to a tool and let it finish.
3. Look at the list of requests: your photo is not in any of them.

> If a tool ever needs a server, for example for an AI feature, its page says so before you start.

## What it does not mean

Browser processing is not magic: very large files can be slow on an old phone, which is why Mochifile limits file sizes. And the page itself still has to be downloaded from the internet once, like any website.
