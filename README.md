# Hey, I’m Umut.

This is the source for [alisoglu.com](https://alisoglu.com/), my personal website for software and projects. File tools that stay local, a Windows dashboard for GitHub projects, and a PCB AIO Tool currently in progress.

## Have a look around

- [About me](https://alisoglu.com/about/) — a little about the person behind the tabs.
- [Routeboard](https://alisoglu.com/routeboard/) — write branching guides, test the routes, and share a self-contained HTML file.
- [Handback](https://alisoglu.com/handback/) — project context, next steps, decisions and screenshots in a portable handover packet.
- [Rowglass](https://alisoglu.com/rowglass/) — compare two CSV/TSV exports privately, match records and keep a clear report. There’s a portable offline download, too.
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

## New document tools

- Word → PDF and PowerPoint → PDF: preview DOCX/PPTX locally, then export flattened page images. Up to 10 MB and 20 pages/slides. Layout can differ from Office; use the original app when exact layout or tagged, accessible PDFs are required. Older DOC/PPT formats, macros and embedded OLE objects aren’t supported.
- Text → PDF: paste notes or open a UTF-8 TXT; choose A4 or Letter and export selectable text.
- PDF → text: read existing selectable text, with page ranges and editable TXT output. Scans use the separate OCR tool.
- CSV ↔ JSON: convert comma-separated tables and arrays of flat row objects. CSV values stay strings. Formula-like CSV text protection is enabled by default.

All five tools work in the connected workspace. Office engines load only after Preview; an optional offline pack keeps them separate from the basic tools.

## Discovery

Routeboard and Handback are separate local editors, published from verified 1.0.0 builds under `public/routeboard/` and `public/handback/`. Their source and portable releases live in their own GitHub repositories. Build a product repository, then use `node scripts/sync-product.mjs <routeboard|handback> <path-to-dist>` to update the website copy. This validates every file against the pinned manifest and copies only public app files. Review the version pin before updating a release. The editors are independent of FileForge’s offline packs.

Rowglass is a separate, dependency-free product. Its verified 1.0.0 build is checked in under `public/rowglass/`; it is copied unchanged to the published site. Source and release builds live at [UmutAlisoglu/rowglass](https://github.com/UmutAlisoglu/rowglass). To update the pinned copy, build that repository and run `node scripts/sync-rowglass.mjs <path-to-rowglass-dist>`. The script validates each manifest hash and copies only the public app files. Review the version pin before publishing a newer release. It does not add Rowglass to FileForge’s offline packs.

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
