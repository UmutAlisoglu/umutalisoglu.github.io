# Umut Alisoglu's personal page

Live at [umutalisoglu.github.io](https://umutalisoglu.github.io/).

A playful personal workshop for the account of Umut Alisoglu. AI took over ;) It features the public Repodock and FileForge apps, explains the human-and-AI process, and includes an interactive prompt playground.

The website includes only public project information. Other app repositories remain private.

## Update the page

Edit index.html for content, styles.css for appearance, and script.js for keyboard focus and the prompt playground. Project source and download links use GitHub's latest release pages.

The playground turns a visitor's task into a starting prompt, suggests example ideas, and copies the result when requested. It runs entirely in the browser and does not call an AI service or upload the visitor's input. Future ideas are labeled as brainstorms; only the featured apps are available to download.

The Repodock dashboard screenshot comes from that project's public docs/dashboard.png. FileForge's icon comes from its assets/fileforge.svg. The cheerful robot is an editable SVG illustration. No external fonts, trackers, or analytics are used.

## Preview locally

    python -m http.server 8780 --bind 127.0.0.1

Open http://127.0.0.1:8780.

## Publishing

GitHub Pages serves the main branch at its root. The .nojekyll file tells Pages to serve these files directly. Pushing a commit to main updates the site.

The old /showcase/ address redirects here. The original showcase tool repository remains private.
