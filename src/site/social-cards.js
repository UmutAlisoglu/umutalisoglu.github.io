// Link preview cards (Open Graph / Twitter) for every public page.
// scripts/render-og-images.mjs draws one 1200 × 630 PNG per entry into assets/og/;
// the page templates point og:image and twitter:image at the matching file.
import { allToolPages } from './tool-catalog.js';

export const OG_WIDTH = 1200, OG_HEIGHT = 630;
const local = ['Runs on your device', 'No upload', 'Free, no account'];

const pages = {
  '/': { home: true, eyebrow: 'Software & personal projects', title: 'Umut Alisoglu', em: 'I make tools for everyday work.', chips: ['FileForge', 'Repodock', 'PCB Art Studio'], visual: { kind: 'home' } },
  '/about/': { eyebrow: 'About', title: 'Umut Alisoglu', em: 'Software, tools & hardware.', subtitle: 'The person behind FileForge, Repodock and PCB Art Studio. Currently building a PCB AIO Tool.', chips: ['Practical software', 'Local first', 'GitHub: UmutAlisoglu'], visual: { kind: 'monogram' } },
  '/projects/': { eyebrow: 'Projects & experiments', title: 'Projects', em: 'Things I build and ship.', subtitle: 'FileForge file tools, the Repodock project launcher, PCB Art Studio and a few experiments.', chips: ['FileForge', 'Repodock', 'PCB Art Studio'], visual: { kind: 'stack' } },
  '/projects/fileforge/': { eyebrow: 'Project · Browser & Windows', title: 'FileForge', em: 'The local file toolkit.', subtitle: 'Free image, PDF, document and video tools in the browser, plus a Windows app for larger jobs.', chips: ['Runs on your device', 'Windows 0.3.0', 'Free'], visual: { kind: 'image', src: 'assets/screenshots/fileforge.jpg', frame: 'browser', position: 'top' } },
  '/projects/repodock/': { eyebrow: 'Project · Windows app', title: 'Repodock', em: 'Your local project launcher.', subtitle: 'Download GitHub projects, review run commands, start and stop processes and read their logs.', chips: ['Windows x64', 'Version 0.3.0', 'Free'], visual: { kind: 'image', src: 'assets/repodock-dashboard.png', frame: 'browser', position: 'left top', zoom: 175 } },
  '/projects/pcb-art-studio/': { eyebrow: 'Browser tool · Image to Gerber', title: 'PCB Art Studio', em: 'Your picture, on a real board.', subtitle: 'Map tones to copper, gold, solder mask and silkscreen, preview the board and download Gerber files.', chips: ['Runs in your browser', 'Gerber ZIP', 'Free'], visual: { kind: 'image', src: 'assets/screenshots/pcb-art-studio.jpg', frame: 'board' } },
  '/projects/skate-scape/': { eyebrow: 'Fan project · Browser game', title: 'Skate Scape', em: 'A fan-made browser game.', subtitle: 'An unofficial fan-made skating game. Best on a computer with keyboard or gamepad.', chips: ['Unofficial fan project', 'Plays in the browser'], visual: { kind: 'image', src: 'assets/screenshots/skate-scape.jpg', frame: 'browser' } },
  '/tools/': { eyebrow: 'FileForge · Free browser tools', title: 'Free file tools', em: 'Your files stay on your device.', subtitle: 'Word and PowerPoint to PDF, PDF tools, images, OCR, CSV/JSON and video. No account, no upload.', chips: local, visual: { kind: 'grid' } },
  '/tools/fileforge/': { eyebrow: 'FileForge · Browser workspace', title: 'FileForge workspace', em: 'Your files. Your browser.', subtitle: 'Images, PDF pages, Excel to PDF, merging and video compression in one place.', chips: local, visual: { kind: 'grid', ids: ['image', 'organize', 'spreadsheet', 'merge', 'video', 'split'] } },
  '/tools/workspace/': { eyebrow: 'FileForge · Connected workspace', title: 'Convert. Refine.', em: 'Keep going.', subtitle: 'Choose a file and pass each result to the next tool in memory, without re-uploading.', chips: local, visual: { kind: 'flow' } },
  '/games/': { eyebrow: 'Games & playful experiments', title: 'Serious about', em: 'having some fun.', subtitle: 'Skate Scape, an unofficial fan project, and a local idea machine to try.', chips: ['Skate Scape', 'Idea machine'], visual: { kind: 'symbol', symbol: '◎', color: 'pink' } },
  '/downloads/': { eyebrow: 'Desktop downloads', title: 'Good on the web.', em: 'At home on your desktop.', subtitle: 'FileForge and Repodock for Windows, straight from their GitHub releases.', chips: ['Windows x64', 'FileForge 0.3.0', 'Repodock 0.3.0'], visual: { kind: 'downloads' } },
  '/privacy/': { eyebrow: 'Privacy', title: 'Your files.', em: 'Your business.', subtitle: 'Selected files are processed in your browser. No analytics, no ads, no conversion server.', chips: ['No file uploads', 'No analytics', 'Opt-in storage'], visual: { kind: 'symbol', symbol: '🔒︎', color: 'mint', label: 'Stays on your device' } },
  '/contact/': { eyebrow: 'Contact & feedback', title: 'Let’s have', em: 'a chat.', subtitle: 'Email umut@alisoglu.com, suggest an improvement or prepare a bug report on GitHub.', chips: ['Email or GitHub', 'Feedback welcome'], visual: { kind: 'symbol', symbol: '✉︎', color: 'blue', label: 'umut@alisoglu.com' } },
  '/tools/file-inspector/': { eyebrow: 'FileForge · Any file type', title: 'File inspector', em: 'What is this file, really?', subtitle: 'Real format from the bytes, metadata, embedded files, hidden data and a hex view.', chips: local, visual: { kind: 'symbol', symbol: '⌕', color: 'blue' } },
  '/idea-machine/': { eyebrow: 'Experiment', title: 'Idea machine', em: 'Annoyance in. Project out.', subtitle: 'Turn an everyday annoyance into a practical project prompt. Runs locally in the browser.', chips: ['Runs locally', 'Free'], visual: { kind: 'symbol', symbol: '✦', color: 'yellow' } },
};

for (const tool of allToolPages) {
  pages[`/tools/${tool.slug}/`] ??= {
    eyebrow: `FileForge · ${tool.category}`, title: tool.name, em: tool.short.endsWith('.') ? tool.short : `${tool.short}.`, subtitle: tool.description,
    chips: local, visual: { kind: 'symbol', symbol: tool.symbol, color: tool.color },
  };
}

export function socialCard(path) {
  const card = pages[path];
  if (!card) return null;
  const slug = path === '/' ? 'home' : path.slice(1, -1).replaceAll('/', '-');
  const plain = `${card.title}${card.title.endsWith('.') ? '' : ' —'} ${card.em}`;
  return { ...card, slug, file: `assets/og/${slug}.png`, url: `https://alisoglu.com/assets/og/${slug}.png`, alt: `${plain} Preview card from alisoglu.com.` };
}

export const socialCardPaths = Object.keys(pages);
