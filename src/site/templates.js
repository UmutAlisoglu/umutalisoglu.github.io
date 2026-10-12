import { readFileSync } from 'node:fs';

export const toolPages = [
  { id: 'image', slug: 'image-converter', name: 'Image studio', symbol: '▧', short: 'Convert, resize & batch', description: 'JPG, PNG, WebP or one PDF. A single image or a whole batch.', color: 'pink' },
  { id: 'organize', slug: 'pdf-organizer', name: 'PDF organizer', symbol: '▦', short: 'Preview, reorder & rotate', description: 'Get your pages in order. Keep the ones you need and export a fresh PDF.', color: 'purple' },
  { id: 'spreadsheet', slug: 'excel-to-pdf', name: 'Excel → PDF', symbol: '▤', short: 'Tables ready to share', description: 'Turn visible XLSX sheets or CSV data into readable PDF tables.', color: 'mint' },
  { id: 'merge', slug: 'merge-pdf', name: 'Merge PDFs', symbol: '⊕', short: 'One tidy document', description: 'Combine separate PDFs in the order you choose.', color: 'yellow' },
  { id: 'video', slug: 'video-compressor', name: 'Video compressor', symbol: '▷', short: 'A smaller MP4', description: 'Choose a size target and compress a short video on your device.', color: 'blue' },
];

export const sitePaths = [
  '/', '/tools/', '/tools/fileforge/', ...toolPages.map(tool => `/tools/${tool.slug}/`),
  '/projects/', '/projects/fileforge/', '/projects/repodock/', '/projects/skate-scape/',
  '/games/', '/downloads/', '/privacy/', '/contact/',
];

function header(path) {
  const navigation = [['/', 'Home'], ['/tools/', 'Tools'], ['/projects/', 'Projects'], ['/games/', 'Games'], ['/downloads/', 'Downloads']];
  return `<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header wrap hub-header">
  <a class="wordmark" href="/" aria-label="Alisoglu home"><span class="monogram">u.</span><span>alisoglu<span class="wordmark-dot">.</span><small>ideas you can actually use</small></span></a>
  <nav aria-label="Main navigation">${navigation.map(([href, label]) => `<a href="${href}"${(href === '/' ? path === '/' : path.startsWith(href)) ? ` aria-current="${path === href ? 'page' : 'true'}"` : ''}>${label}</a>`).join('')}<a href="/contact/" class="nav-contact"${path === '/contact/' ? ' aria-current="page"' : ''}>Say hello <span aria-hidden="true">↗</span></a></nav>
</header>`;
}
const footer = `<footer class="site-footer wrap new-footer"><a class="footer-brand" href="/">alisoglu<span>.</span><small>Human ideas. Useful experiments.</small></a><div><a href="/#about">About Umut</a><a href="/contact/">Contact & feedback</a><a href="/privacy/">Privacy</a><a href="https://github.com/UmutAlisoglu/umutalisoglu.github.io">Website source ↗</a><a href="/THIRD_PARTY_NOTICES.md">Credits</a></div><p class="footer-note">Made with curiosity, a little AI help, and probably one more button.</p></footer>`;

// Vite expands these fragments into ordinary HTML, before bundling scripts and styles.
// Visitors receive the complete page; shared navigation needs no JavaScript.
export function siteTemplates() {
  return {
    name: 'alisoglu-static-templates',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const path = context.path.replace(/index\.html$/, '');
        let result = html.replace('<site-header></site-header>', header(path)).replace('<site-footer></site-footer>', footer);
        if (result.includes('<fileforge-workspace></fileforge-workspace>')) {
          let workspace = readFileSync(new URL('./fileforge-workspace.html', import.meta.url), 'utf8');
          const dedicated = result.match(/data-fileforge-tool="([a-z]+)"/)?.[1];
          if (dedicated) {
            const links = toolPages.map(tool => `<a href="/tools/${tool.slug}/"${tool.id === dedicated ? ' aria-current="page"' : ''}><span class="tool-symbol" aria-hidden="true">${tool.symbol}</span><span>${tool.name}<small>${tool.short}</small></span></a>`).join('');
            workspace = workspace.replace(/<div class="tool-tabs"[\s\S]*?<\/div>/, `<div class="tool-nav" aria-label="More FileForge tools">${links}</div>`)
              .replace('role="tabpanel" aria-labelledby="tab-image"', 'aria-labelledby="tool-title"');
          }
          result = result.replace('<fileforge-workspace></fileforge-workspace>', workspace);
        }
        return result;
      },
    },
  };
}
