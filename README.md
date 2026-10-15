# Alisoglu project hub

Live at [alisoglu.com](https://alisoglu.com/), hosted on GitHub Pages. FileForge has twelve browser tools, thirteen task shortcuts, a connected workspace, editable cutouts, local OCR and optional offline installation. Screenshot studio and Document scanner add creative framing and real perspective correction. Dedicated guides, the classic five-tool studio, project pages, Games, Windows downloads and contact remain available. Images → PDF shares the Image studio engine. Skate Scape is linked at [alisoglu.com/skate-scape](https://alisoglu.com/skate-scape/) and served from its own [UmutAlisoglu/skate-scape](https://github.com/UmutAlisoglu/skate-scape) repository; its code and assets are not copied here.

All FileForge conversions run on the visitor's device. There is no upload/conversion API, database or runtime third-party service. Dependency code, the font, FFmpeg WebAssembly and the background-removal model/runtime are served from this website. The background engine loads only after starting that tool (about 19 MB on first use); its small U2NETP model is 4.6 MB. Browser tools have smaller limits than the desktop app; see [LEARN.md](LEARN.md) for their scope and the step-by-step learning guide.

The website includes only public project information and browser tool source.

## Develop and preview

Requires Node.js 22.13+ (Node.js 24 recommended).

    npm ci
    npm run dev

Open http://127.0.0.1:8780. For the production output:

    npm test
    npm run build
    npm run preview

The playground turns a visitor's task into a starting prompt, suggests example ideas, and copies the result when requested. It runs entirely in the browser and does not call an AI service or upload the visitor's input. Future ideas are labeled as brainstorms; only the featured apps are available to download.

The Repodock dashboard screenshot comes from that project's public docs/dashboard.png. FileForge's icon comes from its assets/fileforge.svg. The original AI-generated product demo and its prompt are documented in assets/demos/README.md. Text and PDF samples are generated locally. No external fonts, trackers, or analytics are used.

## Browser checks

With preview running, create a short test video using FFmpeg:

    mkdir .local/fixtures
    ffmpeg -f lavfi -i testsrc2=size=640x360:rate=24 -f lavfi -i sine=frequency=440:sample_rate=44100 -t 6 -c:v libx264 -preset ultrafast -crf 18 -c:a aac -y .local/fixtures/video.mp4
    npm run test:browser
    npm run test:enhancements
    npm run test:pages
    npm run test:next
    npm run test:workspace
    npm run test:background
    npm run test:ocr
    npm run test:offline

The browser test uses installed Google Chrome. BROWSER_CHANNEL can select another Playwright channel. It checks real downloads, PDF ordering, spreadsheet pagination, cancellation, video encoding, responsive pages and that requests contain no uploads or external runtime requests. Its output is ignored under .local/.

The enhancement checks generate their own image/PDF fixtures. They verify batch ZIP contents and dimensions, duplicate filenames, images-to-PDF order, PDF thumbnails, existing plus new page rotations, drag-and-drop, excluded pages, cancellation/recovery, local preference consent and mobile layout. PDF previews are lazy-loaded through the locally bundled PDF.js renderer. Image batches run in a separate browser worker.

Page checks exercise all 22 routes, navigation, canonical URLs, internal links and anchors, sitemap coverage, dedicated tool selection and real conversions, feedback drafts and screen widths of 320/390/768/1440 px. Feedback is previewed locally; the tests never submit a GitHub issue. Shared headers, footers, catalogue and tool controls are expanded into ordinary HTML by `src/site/templates.js` during Vite's build. See LEARN.md for editing instructions.

The next-release checks verify task search, exact crop pixels and dimensions, SVG vector paths, PDF page-image ZIP contents and actual foreground segmentation through the shipped U2NETP model. They cover cancellations, bad inputs, narrow screens and same-origin GET-only runtime requests. The model fixture is a checksum-pinned public example downloaded into ignored `.local/`; it is never shipped with the website.

## FileForge features

- Image studio: up to 50 images; resize, convert, strip source metadata, download a batch ZIP or combine images into one A4 PDF. Email/web/document presets; optional local image settings.
- PDF organizer: preview up to 200 pages across multiple PDFs, reorder by dragging or buttons, rotate, select/exclude pages and export a new copy. Original files are unchanged. Interactive forms, bookmarks and signatures may not survive page copying.
- Existing Excel/CSV-to-PDF, quick PDF merging and MP4 compression remain available.

No visitor files or filenames are persisted. Optional image settings and favourite tool identifiers are saved in localStorage only after the visitor opts in. Unchecking removes the relevant preference record. The connected workspace keeps current files/results and a short task trail in memory; Clear all or leaving the page releases them.

## Publishing

GitHub Pages source must be **GitHub Actions**. The workflow in .github/workflows/pages.yml tests, builds and deploys dist/ after pushes to main. CNAME preserves the custom domain. No Cloudflare paid service is needed. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) lists dependency credits.

The old /showcase/ address redirects here. The original showcase tool repository remains private.

## Connected workspace, cutout editing, OCR and offline use

- Drop files on the homepage or `/tools/workspace/`; matching actions respect the entire batch and each tool's size limits. Results pass to compatible tools through same-origin structured messages. Standalone results also offer continuation when another tool accepts their format.
- Cutouts retain a full-resolution alpha mask. Erase/restore brushes, keyboard placement, zoom/pan, comparison, undo/reset and custom-colour backgrounds provide control. Changes invalidate the previous export; Export PNG regenerates the actual download. Undo retains at most 20 strokes / 32 MB of alpha tiles.
- `/tools/extract-text/` reads images or up to ten selected scanned PDF pages in English, German or Turkish with Tesseract.js 7.0.0. Output is editable text with Copy/TXT, not a searchable PDF. First-use engine/language downloads are lazy and same-origin, approximately 5.4–7 MB. Images: 20 MB / 12 MP; PDFs: 25 MB; six-minute limit. Assets are version/checksum-pinned in `scripts/prepare-ocr.mjs`.
- Offline installation is optional. Save selected packs to download and verify public build assets. No selected files/results enter Cache Storage. Service worker scope `/tools/` excludes the separate game. Downloads stage atomically, cancellation keeps the old pack, and updates do not reload active conversions. Browser storage can be evicted. Exact sizes are generated from `dist/`; the cross-browser offline OCR pack includes all compatible cores, exceeding the first-use OCR download.

The Windows app remains v0.2.0 with nine native tools. The new OCR reader, connected workspace and mask editor are browser features; the project comparison describes the difference.

## Workshop update — 15 October 2026

- Screenshot studio: PNG/JPEG/WebP up to 20 MB / 20 MP, with real canvas composition, browser/minimal frames, gradient or solid backgrounds, spacing, corners, shadows, tilt and captions. Explicit PNG/JPG/WebP exports at 1600×1000, 1080×1080 or 1920×1080. Preview zoom does not change output size. `/tools/screenshot-studio/?sample=1` generates original sample artwork locally.
- Document scanner: one raster photo up to 20 MB / 12 MP. Manually position four corners with handles, keyboard arrows or exact coordinates. A worker rectifies actual pixels, with original, clean colour, grayscale or adaptive black-and-white treatments, bounded to 3 MP / 3000 px per edge. PNG/JPG or a one-page image PDF; the PDF is not searchable. `/tools/document-scanner/?sample=1` uses a generated document with its known sample corners.
- Ctrl/Cmd+K opens the tool finder. Within a workspace, it offers actions compatible with the current files. Clipboard file paste works outside text fields. Finished output is the default source for the next action; the source picker can deliberately return to the original.
- Image studio now compares actual input/output previews and dimensions. Output names can be changed in the connected workspace while preserving the true extension. No file contents or names are persisted.
- The homepage's workshop design lives in `src/site/showcase.css`; functional shared components remain in their existing modules.

Focused browser checks: `npm run test:finder`, `npm run test:image-preview`, `npm run test:workflow`, plus the screenshot/scanner checks listed in `package.json`. Run them against a production preview after building.
