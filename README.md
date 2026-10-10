# Umut Alisoglu's personal page

Live at [umutalisoglu.github.io](https://umutalisoglu.github.io/).

A static personal website about turning ideas into software with AI. It features the public Repodock and FileForge apps, describes the process openly, and links to their source code and downloads.

The website includes only public project information. Other app repositories remain private.

## Update the page

Edit index.html for content, styles.css for appearance, and script.js for same-page keyboard focus behavior. Project source and download links use GitHub's latest release pages.

The Repodock dashboard screenshot comes from that project's public docs/dashboard.png. FileForge's icon comes from its assets/fileforge.svg. No external fonts, trackers, or analytics are used.

## Preview locally

    python -m http.server 8780 --bind 127.0.0.1

Open http://127.0.0.1:8780.

## Publishing

GitHub Pages serves the main branch at its root. The .nojekyll file tells Pages to serve these files directly. Pushing a commit to main updates the site.

The old /showcase/ address redirects here. The original showcase tool repository remains private.
