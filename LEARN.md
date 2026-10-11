# How this website works

Your Cloudflare domain points at GitHub Pages. GitHub Pages sends website files to visitors. Their browser runs all tool code; selected files are never uploaded. This guide records the steps taken to build the project hub.

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
- `tools/fileforge/index.html`: FileForge controls and explanatory text.
- `src/fileforge/app.js`: file selection, PDF page controls, image presets, progress, cancellation and downloads.
- `src/fileforge/image.worker.js`: sequential image conversion, batch ZIP downloads and combined image PDFs in a background browser task.
- `src/fileforge/pdf-preview.js`: lazy-loaded PDF.js thumbnails; keeps all preview resources on this website.
- `src/fileforge/fileforge.css`: FileForge-specific presets, page cards and mobile layout.
- `src/fileforge/worker.js`: PDF page export, merging and spreadsheet export in a background browser task.
- `src/fileforge/video.js`: FFmpeg WebAssembly, running in a browser worker.
- `games/index.html`: Games catalogue; Skate Scape remains deferred.
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

## Adding a game later

Skate Scape's public release is deferred. It can get a Play button once its browser build and distributable assets are ready. Keep its source repository separate; copy or automatically build a selected release into a site subfolder. Asset URLs must use that subfolder as the base. Source collaboration happens through issues, forks and pull requests, with you deciding what to merge.
