# Hey, I’m Umut.

This is the source for [alisoglu.com](https://alisoglu.com/), my personal website for software and projects. File tools that stay local, a Windows dashboard for GitHub projects, and a PCB AIO Tool currently in progress.

## Have a look around

- [About me](https://alisoglu.com/about/) — a little about the person behind the tabs.
- [FileForge](https://alisoglu.com/tools/) — browser tools for images, PDFs, spreadsheets, video and text. There’s a connected workspace for passing results from one tool to another, too. Windows 0.3.0 bundles that workspace and its engines, alongside the native converters.
- [Repodock](https://alisoglu.com/projects/repodock/) — a Windows app for running local GitHub projects and following their logs.
- [Other experiments](https://alisoglu.com/projects/#experiments) — separate from the main software portfolio, including the unofficial Skate Scape fan project.
- [Downloads](https://alisoglu.com/downloads/) — desktop releases and setup notes.

Questions or ideas? [Say hello](mailto:umut@alisoglu.com), or [open an issue](https://github.com/UmutAlisoglu/umutalisoglu.github.io/issues).

## Run it locally

You’ll need Node.js 22.13 or newer. I use Node 24.

```sh
npm ci
npm run dev
```

Open [127.0.0.1:8780](http://127.0.0.1:8780). To check and preview the production build:

```sh
npm test
npm run build
npm run preview
```

## Where things live

- `index.html` and `about/` are the personal pages.
- `projects/`, `downloads/` and `contact/` have project information and ways to get in touch.
- `src/site/templates.js` expands shared navigation and footers into plain HTML at build time. Navigation works without JavaScript.
- `src/site/personal.css` handles the personal pages and shared site shell. The artwork is CSS, SVG and existing project images; there are no external font requests.
- `src/site/premium.css` refines the shared surfaces and project presentation. `experience.js` adds the mobile menu and short section reveals, with a reduced-motion option and no dependencies. The navigation remains available without JavaScript.
- `src/fileforge/` contains the file-processing tools; `src/site/workspace.js` connects them.
- `tools/` contains the tool directory, individual guides and workspace entry point.

The directory starts with a conversion picker. It shows supported output formats and the same limits used by the tool guides, then opens the converter with that output selected. Files are chosen inside the tool; the picker makes no upload or preference-storage requests. The browser and Windows editions have different feature sets, compared on the FileForge project page.

Run `npm run test:conversions` against the local preview to check picker routing, real JPEG/CSV exports, narrow screens and navigation without JavaScript.

Run `npm run test:design` to check the shared navigation, keyboard controls, six screen widths, reduced motion, metadata and the static fallback. It saves screenshots in `.local/premium-check/`.

Run `npm run test:experience` to check the site-wide tool finder, shareable directory searches, compact active workspace, export progress, reset and recovery from a stalled tool. Screenshots go to `.local/experience-check/`. Run it against the production preview, like the other browser checks.

## Product Kit Studio

`/tools/product-kit/` turns up to 12 JPG/PNG/WebP photos into an organized ZIP. Each numbered product folder contains a square listing image (1000, 1600 or 2000 px; JPG or transparent PNG), a 1000 px WebP and a 480 px WebP thumbnail. `kit.json` records the settings, dimensions and actual sizes. Photos are processed sequentially in a dedicated worker; optional cutouts share one local ONNX session. Cancellation terminates the worker. No files or results are persisted; only explicitly saved settings use local storage. The studio is a browser feature and is not included in the existing Windows 0.3.0 package.

Background removal is opt-in, with a per-photo option to keep its original background. Each export can be inspected at full size or downloaded individually. Settings changes, cancellation and failed rebuilds preserve the previous completed kit. A failed photo is skipped with its reason included in the ZIP manifest, while successful photos are packaged. A failed model download offers a retry without background removal.

Run `npm run test:product-kit` against the production preview (`TEST_URL`, default `http://127.0.0.1:8782`). This checks actual ZIP contents, image dimensions, JPEG output, transparent AI cutouts, per-photo background choices, full-size/individual downloads, previous-build preservation, partial failures, cancellation, saved settings, invalid inputs, responsive layouts and same-origin GET-only requests.

## Guided Quick Jobs

`/tools/workspace/?job=attachment`, `?job=product`, and `?job=document` open guided tasks using the existing local engines. Attachment preparation routes an image, HEIC, PDF or short video to an appropriate tool. Product images pass a cutout through a crop and PNG export. Document photos pass through the scanner and an image-to-PDF export. Each step requires review; no model or video engine starts automatically. The full toolbox remains available, and resetting returns to the original file.

The workspace shows one file picker, one shared result with actual size changes and bounded image previews, and an optional panel for original-file branching. Offline installation is a collapsed, optional section. Browser Quick Jobs are a website feature; the existing Windows 0.3.0 download is an independently published package.

Run `npm run test:quick-jobs` against the production preview for real JPEG/PDF exports, the complete cutout/crop/PNG chain, alpha transparency, presets, invalid-file recovery and narrow screens. It saves screenshots to `.local/quick-jobs-check/`.

The FileForge product demo is a real, silent browser recording. `node scripts/record-attachment-demo.mjs` regenerates it against `TEST_URL` using the original headphones sample; it needs Playwright's FFmpeg runtime (`node node_modules/playwright/cli.js install ffmpeg`). Repodock's demo is an explicitly labelled walkthrough of its existing dashboard screenshot. Neither product demo auto-plays. The recording has a text transcript and does not enter offline tool packs.

The participant script and observation sheet in `docs/usability-session.md` are ready for 3–5 real users. No participant sessions or results are claimed by the automated checks.

`npm run test:products` checks the product recording, keyboard walkthrough, lazy media, release notes, shared cancellation and responsive screenshots. Product media are deliberately excluded from offline processing packs.

Run `npm run check:releases` after publishing a desktop app or updating download links. It checks the pinned website versions against each public latest stable GitHub release, verifies that the expected assets exist, and checks the public download responses and sizes. This network check is separate from normal builds and unit tests.

## New document tools

- Word → PDF and PowerPoint → PDF: preview DOCX/PPTX locally, then export flattened page images. Up to 10 MB and 20 pages/slides. Layout can differ from Office; use the original app when exact layout or tagged, accessible PDFs are required. Older DOC/PPT formats, macros and embedded OLE objects aren’t supported.
- Text → PDF: paste notes or open a UTF-8 TXT; choose A4 or Letter and export selectable text.
- PDF → text: read existing selectable text, with page ranges and editable TXT output. Scans use the separate OCR tool.
- CSV ↔ JSON: convert comma-separated tables and arrays of flat row objects. CSV values stay strings. Formula-like CSV text protection is enabled by default.

All five tools work in the connected workspace. Office engines load only after Preview; an optional offline pack keeps them separate from the basic tools.

## Discovery

The build publishes `/llms.txt`, a `/llm.txt` compatibility alias, `/llms-full.txt`, and Markdown summaries at each public page’s `index.md`. Pages link to these summaries and include structured person, website and tool metadata. Tool claims and limits come from the shared catalogue. These files help readers and crawlers understand the site; they don’t promise search placement.

The home page title is “Umut Alisoglu — Software & personal projects”. Search engines can keep an older listing until they recrawl the page. Use Google Search Console’s URL inspection to request indexing of `https://alisoglu.com/` if the old title is still showing. The sitemap is at `/sitemap.xml`; its home-page modification date reflects the latest content update. `node scripts/render-site-icons.mjs` regenerates the PNG favicon and home-screen icon from the SVG monogram.

## A few notes on the tools

Selected files are processed on the visitor’s device. There’s no conversion server, account system, analytics or file-upload endpoint. Engines, fonts and models are served from this site and load as needed. Each tool explains its own formats and limits.

The workspace keeps files and results in memory. Download what you need before leaving. Optional favourites and image settings are stored locally only when requested. Offline installation is optional and caches public tool assets, never selected files or results. The service worker is scoped to `/tools/`; the separately hosted game manages its own storage.

Background removal uses the bundled U2NETP model. OCR supports English, German and Turkish; its output is editable text, not a searchable PDF. Browser tools and the Windows app have different capabilities. More detail is on the [project page](https://alisoglu.com/projects/fileforge/) and [privacy page](https://alisoglu.com/privacy/).

The contact form prepares a draft locally. Visitors review and send it through their own email app or GitHub. The idea machine also works locally and just puts a starting brief together.

## Browser checks

With a production preview running, these checks use installed Google Chrome:

```sh
npm run test:pages
npm run test:workspace
npm run test:workshop
npm run test:finder
npm run test:documents
```

They cover routes and links, phone-to-desktop layouts, feedback drafts and actual file workflows. More focused checks are listed in `package.json`. Set `TEST_URL` to test another local server, or `BROWSER_CHANNEL` to use another Playwright browser channel. Output goes into ignored `.local/`.

## Publishing

GitHub Pages builds and deploys this repo through `.github/workflows/pages.yml` after a push to `main`. Set the Pages source to **GitHub Actions**. The workflow runs the tests, builds `dist/` and publishes it. `CNAME` keeps the custom domain.

Repodock’s screenshot and FileForge’s icon come from their project assets. Sample artwork is described in [assets/demos/README.md](assets/demos/README.md). Dependency and asset credits are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
