import { readFileSync } from 'node:fs';

import { toolPages, advancedTools, renderToolDirectory } from './tool-catalog.js';
export { toolPages } from './tool-catalog.js';

export const sitePaths = [
  '/', '/tools/', '/tools/fileforge/', '/tools/workspace/', ...toolPages.map(tool => `/tools/${tool.slug}/`), ...advancedTools.map(tool => `/tools/${tool.slug}/`),
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
const footer = `<footer class="site-footer wrap new-footer"><a class="footer-brand" href="/">alisoglu<span>.</span><small>Human ideas. Useful experiments.</small></a><div><a href="/#about">About Umut</a><a href="/contact/">Contact & feedback</a><a href="/tools/workspace/">FileForge workspace</a><button type="button" data-open-offline class="footer-offline">Offline tools</button><a href="/privacy/">Privacy</a><a href="https://github.com/UmutAlisoglu/umutalisoglu.github.io">Website source ↗</a><a href="/THIRD_PARTY_NOTICES.md">Credits</a></div><p class="footer-note">Personal projects by Umut Alisoglu. Built with AI assistance.</p></footer>`;

// Vite expands these fragments into ordinary HTML, before bundling scripts and styles.
// Visitors receive the complete page; shared navigation needs no JavaScript.
export function siteTemplates() {
  return {
    name: 'alisoglu-static-templates',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const path = context.path.replace(/index\.html$/, '');
        let result = html.replace('<site-header></site-header>', header(path)).replace('<site-footer></site-footer>', footer)
          .replace('</head>', '<link rel="manifest" href="/manifest.webmanifest"><script type="module" src="/src/site/offline.js"></script></head>')
          .replace('<fileforge-launcher></fileforge-launcher>', readFileSync(new URL('./launcher-template.html', import.meta.url), 'utf8'))
          .replace('<fileforge-workbench></fileforge-workbench>', readFileSync(new URL('./workspace-template.html', import.meta.url), 'utf8'))
          .replace('<tool-directory></tool-directory>', renderToolDirectory())
          .replace('<tool-directory data-variant="home"></tool-directory>', renderToolDirectory({ compact: true, id: 'home-tools' }))
          .replace('<advanced-tool-links></advanced-tool-links>', `<p>More FileForge tools</p><div class="tool-nav" aria-label="FileForge tools">${[...toolPages, ...advancedTools].map(tool => `<a href="/tools/${tool.slug}/"${path === `/tools/${tool.slug}/` ? ' aria-current="page"' : ''}><span class="tool-symbol" aria-hidden="true">${tool.symbol}</span><span>${tool.name}<small>${tool.short}</small></span></a>`).join('')}</div>`);
        if (result.includes('<fileforge-workspace></fileforge-workspace>')) {
          let workspace = readFileSync(new URL('./fileforge-workspace.html', import.meta.url), 'utf8');
          const dedicated = result.match(/data-fileforge-tool="([a-z]+)"/)?.[1];
          if (dedicated) {
            const links = [...toolPages, ...advancedTools].map(tool => `<a href="/tools/${tool.slug}/"${tool.id === dedicated ? ' aria-current="page"' : ''}><span class="tool-symbol" aria-hidden="true">${tool.symbol}</span><span>${tool.name}<small>${tool.short}</small></span></a>`).join('');
            workspace = workspace.replace(/<div class="tool-tabs"[\s\S]*?<\/div>/, `<div class="tool-nav" aria-label="More FileForge tools">${links}</div>`)
              .replace('role="tabpanel" aria-labelledby="tab-image"', 'aria-labelledby="tool-title"');
          }
          if (!dedicated) workspace = workspace.replace('<div class="desktop-tip">', `<section class="additional-tool-list"><p>More FileForge tools</p>${advancedTools.map(tool => `<a href="/tools/${tool.slug}/">${tool.name} ↗</a>`).join('')}</section><div class="desktop-tip">`);
          result = result.replace('<fileforge-workspace></fileforge-workspace>', workspace);
        }
        if (/^\/tools\/(?!workspace\/|$)/.test(path)) result = result.replace('<div class="breadcrumbs">', '<p class="forge-tool-entry">Want to connect your tools? <a href="/tools/workspace/">Open the workspace →</a></p><div class="breadcrumbs">');
        return result;
      },
    },
  };
}
