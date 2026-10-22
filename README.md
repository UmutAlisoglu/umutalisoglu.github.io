# Hey, I’m Umut.

This is the source for [alisoglu.com](https://alisoglu.com/), my little corner of the internet. A home for the tools, games and side projects I’m making.

## Have a look around

- [About me](https://alisoglu.com/about/) — a little about the person behind the tabs.
- [FileForge](https://alisoglu.com/tools/) — browser tools for images, PDFs, spreadsheets, video and text. There’s a connected workspace for passing results from one tool to another, too.
- [Repodock](https://alisoglu.com/projects/repodock/) — a Windows app for running local GitHub projects and following their logs.
- [Skate Scape](https://alisoglu.com/skate-scape/) — an early-access browser skating game. Its source lives in the separate [skate-scape repo](https://github.com/UmutAlisoglu/skate-scape).
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
- `src/fileforge/` contains the file-processing tools; `src/site/workspace.js` connects them.
- `tools/` contains the tool directory, individual guides and workspace entry point.

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
```

They cover routes and links, phone-to-desktop layouts, feedback drafts and actual file workflows. More focused checks are listed in `package.json`. Set `TEST_URL` to test another local server, or `BROWSER_CHANNEL` to use another Playwright browser channel. Output goes into ignored `.local/`.

## Publishing

GitHub Pages builds and deploys this repo through `.github/workflows/pages.yml` after a push to `main`. Set the Pages source to **GitHub Actions**. The workflow runs the tests, builds `dist/` and publishes it. `CNAME` keeps the custom domain.

Repodock’s screenshot and FileForge’s icon come from their project assets. Sample artwork is described in [assets/demos/README.md](assets/demos/README.md). Dependency and asset credits are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
