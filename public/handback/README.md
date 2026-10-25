# Handback

**Leave the next person a clear starting point.**

Bring the summary, next steps, decisions, open questions, links and screenshots into one project handover. Export a readable HTML packet that stays together, even offline.

[Open Handback](https://alisoglu.com/handback/) · [Portable download](https://github.com/UmutAlisoglu/handback/releases/latest) · [Feedback](https://github.com/UmutAlisoglu/handback/issues)

## What it’s useful for

- Client projects: what is ready, why choices were made, and what remains open.
- Team handovers: context, named owners and the next tasks.
- Builds and prototypes: notes, references and decisions across revisions.
- Events, coursework and personal projects someone else may need to pick up.

Three fictional examples are included. The editor starts with a clearly labelled website-project example.

## Build a handover

1. Choose **New handover**, or adapt an example.
2. Start with the project title, who it is from and to, and a short summary.
3. Add only the sections you need: next steps, notes, decisions, questions, links and screenshots.
4. Check the live packet preview and **Before you share**.
5. Select **Export packet** for a self-contained HTML document.

Tasks have an optional owner and due date, plus an already-done status. Dates are checked as calendar dates. Links must be complete HTTP or HTTPS URLs without embedded credentials. Blank items are left out of the packet. The preview flags missing context and owners; you can still export a deliberately brief handover.

## Save, reopen and share

**Save project** downloads JSON containing every field and screenshot, ready to reopen with **Open project**. Nothing is automatically saved in the browser. Keep an editable copy before closing the page. Replacing an edited working copy asks before discarding it.

**Export packet** creates a self-contained HTML snapshot. Images are embedded; no scripts run and no network resources are loaded. External links open only when a reader chooses them. Use the browser’s Print menu to save a PDF. The packet is a snapshot of the handover, not a live shared task board.

**Markdown** creates a text version for a README or notes app. It lists screenshot captions; the actual images stay in the HTML packet and project JSON.

Packets and JSON include the project details and images you add. Review them before sharing, particularly screenshots. Saved downloads remain where you save them.

## Screenshots

Up to 8 PNG, JPEG or WebP source images, 5 MB each and up to 30 megapixels. Images are checked, decoded and re-encoded locally, resized to at most 1,600 pixels on the longest edge, and stored as JPEG without the original file metadata. Transparent pixels flatten onto white, and animations are not preserved. Processed images must be at most 2 MB each and 8 MB total.

SVG, PDF and other file attachments are not embedded. Add a link to those resources instead. Handback does not fetch links or copy files from linked websites.

## Use it offline

Download and extract `Handback-1.0.0-portable.zip`, then open `index.html`. Keep the files together. No installation, account, network connection, Node, Python or server is needed. It is a portable browser app for a current desktop browser, not a native executable.

## Limits and privacy

Handback version 1 JSON up to 25 MB. Up to 100 tasks, 30 notes, 50 decisions, 50 questions and 60 links, plus the image limits above. Text fields are bounded and imported JSON is validated. Text is escaped in HTML exports; links are limited to HTTP and HTTPS.

The app uses the current page’s memory. It makes no upload, analytics, font, API or account requests and saves no project history to cookies, localStorage or IndexedDB. The online app is hosted on GitHub Pages, which receives ordinary connection information when serving its public code. The portable editor works offline. Clear the working copy with New handover or close the tab when finished; downloads remain on your computer.

## Development

Node.js 22 or newer is needed for development only. The core checks and build need no installed packages:

```sh
npm test
npm run build
npm run dev
```

For browser checks: `npm ci`, `npx playwright install chromium`, `npm run build`, then `npm run test:browser`. It starts a local preview and checks real edits, screenshot processing, project round trips and exported files. Set `BROWSER_CHANNEL=chrome` to use installed Chrome. Playwright is a development dependency only.

The data model is `src/core.js`, the editor is `src/app.js`, and examples are in `src/samples.js`. `dist/` contains the portable application and SHA-256 build manifest. GitHub Actions checks Windows and Linux, with real browser checks on Linux.

MIT licensed. A project by [Umut Alisoglu](https://alisoglu.com/).
