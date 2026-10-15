# How this website works

Your Cloudflare domain points at GitHub Pages. GitHub Pages sends website files to visitors. Their browser runs all tool code; selected files are never uploaded. This guide records the steps taken to build the project hub.

## Latest workshop additions — 15 October 2026

Two tools turn their processing into something you can see and control:

1. **Screenshot studio:** `src/fileforge/screenshot-renderer.js` draws the background, frame, shadow, chosen screenshot and caption onto a canvas. The preview and export use the same painter, so the preview represents the composition you download. Preview zoom is only a viewing control. The sample is original artwork drawn on your device. Styling lives in `screenshot-studio.css`; controls and export live in `screenshot-studio.js`.
2. **Document scanner:** select four corners of a flat photographed page. `scanner-math.js` calculates a perspective mapping; `scanner.worker.js` uses it to sample the source pixels into a rectangle, then applies the selected paper treatment. Manual corners are adjustable by dragging, arrow keys or number inputs. The sample knows its generated corners; this is not automatic document detection. PDF export places the corrected image on a page. To get editable text, export an image and continue to Extract text.
3. **Connected results:** the workspace uses the latest result for the next action. Its source picker lets you deliberately start again with the original. The export-name field retains the actual file extension. Ctrl/Cmd+K opens a local tool finder, and an explicit paste outside a text field can select a clipboard image file. Nothing monitors or reads your clipboard in the background.
4. **The visual identity:** `index.html` and `src/site/showcase.css` contain the homepage's strong typography, folded-file detail and two illustrated tool introductions. The illustrations are labelled; opening each sample produces real output you can edit and export. The rest of the site keeps its shared navigation and purple/off-white palette.

To add another engine, create its page and module, add its entry to `src/site/tool-catalog.js`, set accepted files in `src/site/workspace-tools.js`, and add its URL to `sitemap.xml`. The advanced-tool catalogue supplies its build route and directory links. Configure `workspace-bridge.js` for file handoffs, explicit busy status, result invalidation and published exports. Worker URLs must use Vite's `new URL('./worker-file.js', import.meta.url)` pattern so they remain under `/tools/_assets/` and work with the optional offline pack. Check a real export, cancellation, invalid input, narrow screens and continuing to another tool before publishing.

## 1. Get a local copy

    git clone https://github.com/UmutAlisoglu/umutalisoglu.github.io.git .

Git keeps a history of source changes. `git status` shows your local changes; `git diff` shows their contents. Cloning does not change the live site.

## 2. Install build dependencies

    npm ci

Node.js runs development tools on your computer. npm installs the packages recorded in package-lock.json. Vite bundles JavaScript into browser files; it is not a production server or paid service. Visitors do not need Node.js or Python.

## 3. Preview and edit

    npm run dev

Open http://127.0.0.1:8780. This local server serves website files for preview. It has no conversion API. Saving a source change updates the preview.

- `index.html`: home page and project introductions.
- `hub.css` / `styles.css`: layout, colours, responsive design.
- `tools/fileforge/index.html`: the original FileForge workspace; old bookmarks still work.
- `tools/*/index.html`: dedicated working tools with their own descriptions, steps, limits and FAQs.
- `src/site/fileforge-workspace.html`: shared FileForge controls, used by all six tool pages.
- `src/site/templates.js`: shared navigation/footer, tool links and the list of pages Vite builds.
- `site.css`: homepage shortcuts, project pages, guides, contact and privacy layouts.
- `projects/*/index.html`: project descriptions, visuals, releases and setup instructions.
- `contact/index.html` / `src/site/contact.js`: email/GitHub contact and a local feedback-draft form.
- `privacy/index.html`: how local files, optional settings, hosting and contact data work.
- `src/fileforge/app.js`: file selection, PDF page controls, image presets, progress, cancellation and downloads.
- `src/fileforge/image.worker.js`: sequential image conversion, batch ZIP downloads and combined image PDFs in a background browser task.
- `src/fileforge/pdf-preview.js`: lazy-loaded PDF.js thumbnails; keeps all preview resources on this website.
- `src/fileforge/fileforge.css`: FileForge-specific presets, page cards and mobile layout.
- `src/fileforge/worker.js`: PDF page export, merging and spreadsheet export in a background browser task.
- `src/fileforge/video.js`: FFmpeg WebAssembly, running in a browser worker.
- `games/index.html`: Games catalogue, with a link to Skate Scape’s separate early-access browser build.
- `downloads/index.html`: links to your existing GitHub Releases.

A Web Worker is a background JavaScript task inside the visitor's browser. It keeps longer conversions off the page's main thread. WebAssembly lets the browser run compiled FFmpeg code. We use the single-thread core so GitHub Pages does not need custom cross-origin isolation headers.

## 4. Check the finished site

    npm test
    npm run build
    npm run preview

`build` writes the deployable website into `dist/`, including the video engine, font and dependency credits. `preview` serves that finished output so we can check the same files visitors will get. The video engine loads only when a visitor starts a video job, not when they open the home page.

The optional browser smoke test uses installed Google Chrome:

    npm run test:browser
    npm run test:enhancements
    npm run test:pages

Keep the preview server running in another terminal. The test expects `.local/fixtures/video.mp4`; create a small fixture with FFmpeg as described in README.md. Screenshots and generated test outputs go to `.local/browser-check/`, which Git ignores.

## 5. Publish through GitHub Pages

The Pages workflow builds the website after a push to main and publishes only `dist/`. In the repository's Settings → Pages, the source must be **GitHub Actions**. `CNAME` preserves alisoglu.com.

    git add .
    git commit -m "Describe what changed"
    git push

Review `git status` and `git diff` before staging. A push to main publishes an update; a local edit alone does not. GitHub's Actions page shows whether the build and deployment succeeded. Standard hosted Actions runners for public repositories do not require buying a hosting plan.

## 6. Privacy and practical limits

The website has no accounts, database, upload endpoint, tracker or conversion history. Files live in browser memory while selected. Clear releases those references, previews and the download URL; closing the tab ends its conversions. Browser/OS memory reclamation is automatic, so this is not a claim of secure memory erasure. Normal browser caching may store website code and fonts/engines, never an uploaded copy of your selected file. The optional “Remember my image settings” checkbox stores only format, quality and width (plus a version) in localStorage on that device; unchecking it removes the record.

- Image studio: up to 50 images, 20 MB / 40 megapixels each, 100 MB input total, 150 MB converted-image total. JPG, PNG, WebP, GIF (first frame), BMP. No browser TIFF conversion. Multiple raster outputs download as a ZIP; PDF output combines all images in the displayed order. Duplicate filenames are made distinct. Images shrink to the maximum width without enlargement.
- PDF organizer: 1–20 unlocked PDFs, 25 MB each / 75 MB total, 200 pages. Drag or use arrows to reorder, rotate clockwise, uncheck pages to omit them, reset to restore originals, and export. Bookmarks, interactive forms and digital signatures may not be preserved. Page omission is not a secure-redaction tool.
- Spreadsheet: XLSX/UTF-8 CSV, 10 MB, 10,000 rows / 80 columns per visible sheet, 20,000 rows total. PDF tables, not Excel's original print layout. Saved formula results are used; missing results appear as formula text with a warning.
- Merge: 2–20 unlocked PDFs, 25 MB each / 75 MB total, 1,500 output pages.
- Video: 100 MB input, two-pass H.264 MP4 with actual size validation and retries. A 15-minute job limit; hardware, browser memory and background-tab throttling affect speed. Larger jobs should use the Windows app.

No new paid platform is introduced. Hosting still serves static website files. GitHub Pages' storage and bandwidth limits continue to apply.

## How the new FileForge features work

1. **Image batches:** the page passes selected file bytes to a worker. It decodes one image at a time, draws it at the chosen size with OffscreenCanvas, and encodes the new image. fflate wraps multiple outputs in a ZIP; pdf-lib can instead place each image on an A4 page. Cancelling terminates the worker.
2. **PDF organization:** PDF.js renders small local previews. The page records each card's source file, page number, added rotation and selected state. Export sends that plan to pdf-lib, which copies the actual pages in that order; it does not turn your document into thumbnail images.
3. **Presets:** buttons fill ordinary image settings. You can adjust them before conversion. Saving settings is optional and separate from selecting files.
4. **Publishing:** these are static JavaScript/CSS changes. The existing GitHub Actions workflow builds them after a push; neither a conversion server nor a paid hosting product is involved.

## Connecting the game

Skate Scape is now served at `/skate-scape/` from its own GitHub Pages project repository. The Games page and Skate Scape project page link to it; the hub does not embed it or preload its game data. Development and deployment of the game stay separate from this repository. Its own README documents the first download, browser caching, controls and local setup. The FileForge privacy promise concerns selected files in the tools; the game downloads data from GitLab and persists game state locally, as described on the privacy page.

## The new pages: how to make your own edits

The site now has 24 pages. They are still ordinary HTML, CSS and JavaScript hosted by GitHub Pages. No server, paid service or account system was added.

1. **Edit page content.** Open the relevant `index.html`, for example `projects/fileforge/index.html` for the FileForge project story or `tools/pdf-organizer/index.html` for the organizer guide. Change its headings, paragraphs or links. Keep release claims matched to the actual GitHub release and update the “checked” date when you verify them.
2. **Edit shared parts once.** Each source page contains `<site-header></site-header>` and `<site-footer></site-footer>`. The small Vite plugin in `src/site/templates.js` replaces these with complete navigation and footer HTML during preview/build. This is a build step, not a service on the internet. Even visitors with JavaScript disabled get the navigation and project content.
3. **Reuse the working tool.** Tool pages contain `<fileforge-workspace></fileforge-workspace>`. Vite fills this with the shared controls from `src/site/fileforge-workspace.html`. The `data-fileforge-tool` value on the page’s `<body>` chooses its tool. `app.js` uses that value to initialise the existing converter. Dedicated pages use real links between tools, so their URL and guide stay in sync. Leaving a page discards the current selection; download your result first.
4. **Keep old links useful.** `/tools/fileforge/#organize`, `#image`, `#spreadsheet`, `#merge` and `#video` still open the original tabbed workspace. Direct task links now use `/tools/pdf-organizer/`, `/tools/image-converter/`, `/tools/excel-to-pdf/`, `/tools/merge-pdf/` and `/tools/video-compressor/`.
5. **Add a page.** Create a folder and `index.html`, copy the standard head/header/footer from another page, and give it a unique title, description and canonical URL. Add the route to `sitePaths` in `src/site/templates.js` and to `sitemap.xml`. Vite then builds it into `dist/`. A sitemap helps search engines discover pages; it does not guarantee indexing or ranking.
6. **Preview and check.** Run `npm run dev` for editing. Before publishing, run `npm test`, `npm run build`, then `npm run preview` and `npm run test:pages` in separate terminals. The page checks cover links, anchors, all dedicated tools’ initial state, sample conversions, contact drafts, privacy requests, no-JavaScript navigation and screen widths from 320 to 1440 px.
7. **Publish.** Review the diff, commit and push to `main`. The existing GitHub Actions workflow publishes the built `dist/` folder. Neither the shared templates nor the `.local/` development helpers need to run for visitors.

The contact page links to **umu@alisoglu.com**, the address you supplied. A `mailto:` link opens the visitor’s email application; it does not create or configure the mailbox. GitHub links remain available too. The feedback form uses local JavaScript to prepare an issue URL, then the visitor explicitly opens GitHub to review and submit. It does not send a report automatically. With JavaScript disabled, direct email and project links still work, and the draft form stays hidden to prevent a normal form submission.

The social sharing image is drawn in `assets/social-card.svg`. To regenerate its PNG after editing the SVG, run `node scripts/render-social-card.mjs` with Google Chrome installed. Then build again. This image is used by the pages’ Open Graph metadata.

Design changes use an off-white background, purple accent and colourful tool icons. `site.css` adds responsive layouts; `prefers-reduced-motion` disables decorative transitions for visitors who request less motion. Skate Scape’s illustration is explicitly a project illustration, not a gameplay screenshot.

Checks for this update: all 16 destinations and internal anchors, real image/PDF/spreadsheet exports, the existing video encoder, PDF page operations and image batches. Hub and FileForge runtime requests were checked for same-site GETs only; the separately deployed game is outside those conversion tests. No selected files or feedback drafts were uploaded during testing.

A newer commit from Claude published the Skate Scape launch link while this redesign was being prepared. Git refused to overwrite that remote history. We fetched and merged it, kept the Play link, and updated the new project page, privacy notes and status labels to match. This preserves both sets of work without a force push.

## Making the design a little more professional

The visual polish lives mainly in `site.css`. The variables at the top set the shared background, text, border and purple accent colours. White cards with thin borders make the colourful icons easier to pick out; consistent sans-serif headings, spacing and buttons make the pages feel related. The homepage's `collection-panel` in `index.html` links directly to the three projects. The robot was removed from the homepage, Projects, Games and social sharing image for a more understated presentation.

To experiment, change one colour or spacing value, run `npm run dev`, and compare the homepage, a tool page and a project page at desktop and phone widths. Use the browser's responsive device view to check narrow screens. CSS changes presentation; the conversion workers still run the existing tools locally in the visitor's browser. Shared footer wording is in `src/site/templates.js`, and the matching link-preview image is in `assets/social-card.svg`.

## Growing FileForge into an everyday toolbox

This release adds four tools: background removal, image → SVG tracing, image cropping and PDF → images. The original five tools remain available. Ten task cards describe nine engines: “Images → PDF” opens Image studio with PDF already selected through `?format=pdf`. This avoids building the same converter twice.

- **Search and navigation:** `src/site/tool-catalog.js` is the shared list of tools, task names, categories and search aliases. Search filters that list locally; it does not send your query to an AI service. `src/site/tool-search.js` enables the input and category buttons. The build inserts ordinary links into the HTML, so the directory works without JavaScript.
- **New tool interface:** `src/fileforge/advanced.js` handles one selected file, settings, previews, cancellation and downloads. Its CSS is in `advanced.css`. Each tool has its own HTML guide in `tools/`. Clear closes decoded bitmaps and revokes preview/download URLs. Files and filenames are never saved to browser storage.
- **Background removal:** `background.worker.js` runs the Apache-licensed U²-Net small model through ONNX Runtime Web. The model predicts a 320 × 320 mask; the browser resizes it and multiplies it with the original image's alpha channel. The compact model trades fine-edge quality for a small download. Review hair, transparent objects and complex scenes. Model and runtime total about 19 MB and load only after starting a job. Single-thread WASM works on the existing Pages host without requiring special response headers. Provenance and checksum live in `assets/models/README.md`.
- **SVG tracing:** `trace.worker.js` uses ImageTracerJS to convert pixels into vector paths. It runs on a copy with a maximum 1000 px longest edge, with colour/detail settings. SVG output is shown through an image element and downloaded as a file. It is never inserted as executable page markup. This is tracing, so photos and small text are approximations, not recovered original design layers.
- **Cropping:** dragging changes a rectangle in original pixel coordinates. Numeric inputs provide the same control with a keyboard. Export draws only that region into a fresh canvas; PNG/WebP keep transparency and JPG uses white. No camera metadata is copied from the source.
- **PDF images:** `pdf-images.js` renders requested pages sequentially with the existing PDF.js engine. One page downloads directly; multiple images become a ZIP with page-number filenames. Pages are rendered into pictures with no PDF scripts or links executed. Select up to 50 pages and 150 MB output; annotations/forms are excluded.

For your next tool, first decide its accepted inputs, output, practical limits and error messages. Add its catalogue entry and HTML guide, then connect an engine that runs on the visitor's device. Use a worker for long CPU tasks. Vite needs a literal `new Worker(new URL('./engine.worker.js', import.meta.url), { type: 'module' })` expression to bundle worker dependencies correctly.

To check this release: `npm test`, `npm run build`, start `npm run preview`, then run `npm run test:pages` and `npm run test:next` in another terminal. The focused new checks inspect actual exported pixels/paths/ZIP entries and the real model's foreground mask, rather than merely checking that a success message appeared. Publish with the existing commit/push → GitHub Actions workflow.

## Keeping the Windows release and website in sync

FileForge for Windows 0.2.0 now includes the same nine main tasks, with native conversion libraries, image batches and a bundled background model. It is maintained in the separate `UmutAlisoglu/fileforge` repository. A website edit changes browser code; a desktop update needs a new tested executable and GitHub Release. Its own LEARN.md explains that build.

For this release, the Windows source passed Python checks and browser interface checks. The built executable ran actual crop, SVG, PDF-image and background jobs, and the installer was checked in an isolated folder without changing installed applications. The release ZIP was checked for required files and a SHA-256 checksum. The website download links, version, package size and feature comparison were then updated together. Installed desktop copies get new features after downloading and installing the new package. No automatic updater or paid processing service was added.

## The connected FileForge release — 14 October 2026

This upgrade has 22 pages and ten browser engines. A professional homepage gives visitors a working drop zone and original samples before introducing the other projects. No conversion server or paid API was added.

1. **The workspace shell:** `src/site/workspace.js` keeps the original/current File objects in page memory. `workspace-tools.js` describes compatible formats and size limits; the same searchable catalogue powers both directories. Files are never put in localStorage or IndexedDB. Start over restores the original; Clear all releases the complete session.
2. **Reuse engines through a bridge:** a same-origin iframe displays the selected tool. `src/fileforge/workspace-bridge.js` sends File/Blob objects using `postMessage`; both ends check the origin and exact sender window. The old tool pages still work directly. A finished PNG/PDF can continue into another compatible tool without downloading. TXT, SVG and ZIP outputs show a download but no incompatible next step.
3. **Cutout editing:** the model creates a mask. The editor paints that mask at source resolution, preserving source alpha. Preview zoom/comparison affect only the view. A changed mask invalidates the old download until Export PNG creates fresh bytes. Undo stores small affected alpha tiles with a memory budget.
4. **OCR:** `ocr-engine.js` uses the pinned local Tesseract worker protocol. `ocr-pdf.js` renders selected PDF pages before reading them. The worker can be terminated during engine download as well as recognition. Review the text, edit it, then copy/download. This feature produces TXT; it does not advertise a searchable PDF. Engine/language assets are copied from exact npm packages after checksum checks.
5. **Offline packs:** `scripts/build-offline-manifest.mjs` lists actual public output files with byte sizes and SHA-256 hashes. `public/sw.js` checks each download and switches only to a complete snapshot. It controls `/tools/`, keeping the game separate. Caches contain public code/models, never selected files. Updates wait for open tool tabs to close. Installation and downloading offline engines are separate choices.
6. **Presentation and demos:** `launcher-template.html`, `workspace-template.html` and `workspace.css` describe the new app interface. `workspace-samples.js` generates original text/PDF examples locally and fetches the public product photo. The photo's ImageGen prompt/provenance lives in `assets/demos/README.md`. It is labeled as a generated sample, and actual results come from the real local tools.

To try a change, run `npm run dev`. For final checks, run `npm test` and `npm run build`, start `npm run preview`, then run `npm run test:workspace`, `npm run test:background`, `npm run test:ocr` and `npm run test:offline`. Offline QA must use a production build so its asset hashes match the files being served. Avoid rebuilding while a browser check is downloading a pack; the deliberate integrity check will reject changed bytes.

A browser release and a Windows release are separate builds. These new workspace/OCR/editor features are currently in the website; Windows v0.2.0 retains its nine tested native tools. Keep the comparison honest when adding features.
