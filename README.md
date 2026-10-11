# Alisoglu project hub

Live at [alisoglu.com](https://alisoglu.com/), hosted on GitHub Pages. Home, Games, FileForge browser tools and Windows downloads. Skate Scape's release is deferred; its assets and source are not added to this repository.

All FileForge conversions run on the visitor's device. There is no upload/conversion API, database or runtime third-party service. Dependency code, the font and FFmpeg WebAssembly are served from this website. Browser tools have smaller limits than the desktop app; see [LEARN.md](LEARN.md) for their scope and the step-by-step learning guide.

The website includes only public project information and browser tool source.

## Develop and preview

Requires Node.js 22.12+ (Node.js 24 recommended).

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

The browser test uses installed Google Chrome. BROWSER_CHANNEL can select another Playwright channel. It checks real downloads, PDF ordering, spreadsheet pagination, cancellation, video encoding, responsive pages and that requests contain no uploads or external runtime requests. Its output is ignored under .local/.

## Publishing

GitHub Pages source must be **GitHub Actions**. The workflow in .github/workflows/pages.yml tests, builds and deploys dist/ after pushes to main. CNAME preserves the custom domain. No Cloudflare paid service is needed. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) lists dependency credits.

The old /showcase/ address redirects here. The original showcase tool repository remains private.
