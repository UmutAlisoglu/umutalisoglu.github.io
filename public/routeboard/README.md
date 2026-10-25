# Routeboard

**A clearer next step.**

Turn a process into an interactive guide. Write the steps, add choices, connect their destinations, and try the route as a reader. Then export one HTML file someone else can open offline.

[Open Routeboard](https://alisoglu.com/routeboard/) · [Portable download](https://github.com/UmutAlisoglu/routeboard/releases/latest) · [Feedback](https://github.com/UmutAlisoglu/routeboard/issues)

## A few uses

- Troubleshooting: ask what someone sees and take them to the next check.
- Onboarding: give different roles a path through their first tasks.
- Support guides: make recurring questions easier to work through.
- Workshop processes, delivery checklists and other repeatable work.

Three fictional examples are included: printer troubleshooting, project onboarding and a delivery checklist. The editor starts with a clearly labelled example.

## Make a guide

1. Choose **New guide**, or adapt an example.
2. Give the guide a title and a short summary. Write the first step.
3. Add the other steps. For each choice, write its label and choose its destination. A step with no choices is an ending.
4. Choose the starting step. Use the live walkthrough, Back and Restart to test your routes.
5. Check **Before you share**, then select **Export guide**.

The route overview lists the connections. Missing destinations and empty connected-step titles or choice labels block export. Loops are allowed with a warning, so intentional retry routes can work. Unconnected steps are excluded from the shared guide; they remain in the editable project.

## Save the work and share the result

**Save project** downloads JSON for later editing. Use **Open project** to restore it. The working copy lives in the current tab only: remember to save it before closing the page. Replacing an edited guide asks before discarding the working copy.

**Export guide** creates a self-contained HTML file with no scripts or external resources. The reader follows ordinary links between steps and uses the browser’s Back button to revisit a choice. Start again returns to the first step. A modern browser with CSS `:has` support gives the single-step presentation. Printing shows all connected steps; use Print to save a PDF.

A guide is a snapshot, not a hosted form. It doesn’t submit answers, record reader progress or notify you when someone uses it. Only connected content is shared. Review the exported file before sending it.

## Use the editor offline

Download and extract `Routeboard-1.0.0-portable.zip`, then open `index.html`. Keep the files together. No installation, account, internet connection, Node, Python or local server is needed. It is a portable browser app, not a native executable.

## Formats and limits

- Routeboard version 1 JSON, up to 2 MB.
- 1–80 steps, with up to 8 choices per step.
- Guide and step titles: 120 characters. Summary: 800. Instructions: 6,000 per step.
- Plain text only. No embedded HTML, scripts, media or arbitrary file attachments.

Imported JSON is validated, bounded, and copied into the editor’s data model. Identifiers must be unique and use letters, digits, underscores or hyphens. Deleting a step leaves its incoming choices unconnected, with an explanation so you can repair them before exporting.

## Privacy

The editor uses page memory and makes no upload, analytics, font or account requests. It saves no project history to cookies, localStorage or IndexedDB. The online app is hosted on GitHub Pages, which receives ordinary connection information when serving its public files. The portable download works with the network disconnected.

Project JSON includes every step, including drafts. Shared HTML includes only connected steps. These files contain the text you include; send them to the intended readers. Saved downloads remain wherever you save them.

## Development

Node.js 22 or newer is needed for development only. Core checks and builds need no installed packages:

```sh
npm test
npm run build
npm run dev
```

For browser checks: `npm ci`, `npx playwright install chromium`, `npm run build`, then `npm run test:browser`. The script starts its own local preview, checks the editor and real exports, and opens exported HTML with JavaScript disabled. Set `BROWSER_CHANNEL=chrome` to use installed Chrome. Playwright is a development dependency; it is not shipped with the app.

The engine is `src/core.js`, the editor is `src/app.js`, and examples are in `src/samples.js`. `dist/` contains the portable editor with a SHA-256 build manifest. GitHub Actions checks Windows and Linux, with browser checks on Linux.

MIT licensed. A project by [Umut Alisoglu](https://alisoglu.com/).
