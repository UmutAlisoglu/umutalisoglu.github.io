# Alisoglu project hub

Live at [alisoglu.com](https://alisoglu.com/), hosted on GitHub Pages. A homepage with task shortcuts, five dedicated FileForge tool pages, the original FileForge workspace, project pages, Games, Windows downloads, privacy notes and email/GitHub contact. Skate Scape’s early-access build is linked at [alisoglu.com/skate-scape](https://alisoglu.com/skate-scape/) and served from its own [UmutAlisoglu/skate-scape](https://github.com/UmutAlisoglu/skate-scape) repository. The game’s source and assets are not copied into this hub.

All FileForge conversions run on the visitor's device. There is no upload/conversion API, database or runtime third-party service. Dependency code, the font and FFmpeg WebAssembly are served from this website. Browser tools have smaller limits than the desktop app; see [LEARN.md](LEARN.md) for their scope and the step-by-step learning guide.

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

The Repodock dashboard screenshot comes from that project's public docs/dashboard.png. FileForge's icon comes from its assets/fileforge.svg. The cheerful robot is an editable SVG illustration. No external fonts, trackers, or analytics are used.

## Browser checks

With preview running, create a short test video using FFmpeg:

    mkdir .local/fixtures
    ffmpeg -f lavfi -i testsrc2=size=640x360:rate=24 -f lavfi -i sine=frequency=440:sample_rate=44100 -t 6 -c:v libx264 -preset ultrafast -crf 18 -c:a aac -y .local/fixtures/video.mp4
    npm run test:browser
    npm run test:enhancements
    npm run test:pages

The browser test uses installed Google Chrome. BROWSER_CHANNEL can select another Playwright channel. It checks real downloads, PDF ordering, spreadsheet pagination, cancellation, video encoding, responsive pages and that requests contain no uploads or external runtime requests. Its output is ignored under .local/.

The enhancement checks generate their own image/PDF fixtures. They verify batch ZIP contents and dimensions, duplicate filenames, images-to-PDF order, PDF thumbnails, existing plus new page rotations, drag-and-drop, excluded pages, cancellation/recovery, local preference consent and mobile layout. PDF previews are lazy-loaded through the locally bundled PDF.js renderer. Image batches run in a separate browser worker.

Page checks exercise all 16 routes, navigation, canonical URLs, internal links and anchors, sitemap coverage, dedicated tool selection and real conversions, feedback drafts and screen widths of 320/390/768/1440 px. Feedback is previewed locally; the tests never submit a GitHub issue. Shared headers, footers and tool controls are expanded into ordinary HTML by `src/site/templates.js` during Vite's build. See LEARN.md for editing instructions.

## FileForge features

- Image studio: up to 50 images; resize, convert, strip source metadata, download a batch ZIP or combine images into one A4 PDF. Email/web/document presets; optional local image settings.
- PDF organizer: preview up to 200 pages across multiple PDFs, reorder by dragging or buttons, rotate, select/exclude pages and export a new copy. Original files are unchanged. Interactive forms, bookmarks and signatures may not survive page copying.
- Existing Excel/CSV-to-PDF, quick PDF merging and MP4 compression remain available.

No files or filenames are persisted. When a visitor opts in, only the image format, quality, width and settings-version number are saved in localStorage. Unchecking the option removes that preference record.

## Publishing

GitHub Pages source must be **GitHub Actions**. The workflow in .github/workflows/pages.yml tests, builds and deploys dist/ after pushes to main. CNAME preserves the custom domain. No Cloudflare paid service is needed. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) lists dependency credits.

The old /showcase/ address redirects here. The original showcase tool repository remains private.
