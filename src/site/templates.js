import { readFileSync } from 'node:fs';
import { discoveryTags } from './discovery.js';
import { renderConversionPicker } from './conversion-options.js';
import { renderQuickJobs } from './quick-jobs.js';
import { renderEditionChoice, renderProductDemo } from './product-content.js';

import { toolPages, advancedTools, documentTools, allToolPages, renderToolDirectory } from './tool-catalog.js';
import { toolUsage, renderToolUsage } from './tool-usage.js';
export { toolPages } from './tool-catalog.js';

export const sitePaths = [
  '/', '/tools/', '/tools/fileforge/', '/tools/workspace/', ...allToolPages.map(tool => `/tools/${tool.slug}/`),
  '/projects/', '/projects/fileforge/', '/projects/repodock/', '/projects/skate-scape/',
  '/games/', '/downloads/', '/privacy/', '/contact/', '/idea-machine/', '/about/',
];

function header(path) {
  const navigation = [['/', 'Home'], ['/about/', 'About'], ['/projects/', 'Projects'], ['/tools/', 'Tools'], ['/downloads/', 'Downloads']];
  const finder = '<button type="button" class="tool-switcher-trigger" data-open-tools hidden aria-haspopup="dialog" title="Find a tool (Ctrl or Command + K)"><span aria-hidden="true">⌕</span> Find a tool <kbd aria-hidden="true">Ctrl K</kbd></button>';
  return `<a class="skip-link" href="#main">Skip to content</a>
<div class="site-header-band"><header class="site-header wrap hub-header">
  <a class="wordmark" href="/" aria-label="Umut Alisoglu home"><span class="monogram">u.</span><span>umut alisoglu<span class="wordmark-dot">.</span><small>software &amp; projects</small></span></a>
  <button class="site-menu-toggle" type="button" aria-expanded="false" aria-controls="site-navigation" hidden><span>Menu</span><span class="menu-lines" aria-hidden="true"></span></button>
  <nav id="site-navigation" aria-label="Main navigation">${navigation.map(([href, label]) => `<a href="${href}"${(href === '/' ? path === '/' : path.startsWith(href)) ? ` aria-current="${path === href ? 'page' : 'true'}"` : ''}>${label}</a>`).join('')}${finder}<a href="/contact/" class="nav-contact"${path === '/contact/' ? ' aria-current="page"' : ''}>Say hello <span aria-hidden="true">↗</span></a></nav>
</header></div>`;
}
const footer = `<footer class="site-footer wrap new-footer"><a class="footer-brand" href="/">umut alisoglu<span>.</span><small>Thanks for stopping by.</small></a><div><a href="/about/">About me</a><a href="/contact/">Contact & feedback</a><a href="/tools/workspace/">FileForge workspace</a><a href="/downloads/">Downloads</a><a href="/projects/#experiments">Other projects</a><a href="/idea-machine/">Idea generator</a><button type="button" data-open-offline class="footer-offline">Offline tools</button><a href="/privacy/">Privacy</a><a href="/THIRD_PARTY_NOTICES.md">Credits</a></div><p class="footer-note"><span>© 2026 Umut Alisoglu</span><a href="https://github.com/UmutAlisoglu/umutalisoglu.github.io">This site on GitHub ↗</a></p></footer>`;

// Vite expands these fragments into ordinary HTML, before bundling scripts and styles.
// Visitors receive the complete page; shared navigation needs no JavaScript.
export function siteTemplates() {
  return {
    name: 'alisoglu-static-templates',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const path = context.path.replace(/index\.html$/, '');
        if (path === '/tools/office-engine/') return html;
        let result = html.replace('<site-header></site-header>', header(path)).replace('<site-footer></site-footer>', footer)
          .replace('</head>', '<link rel="stylesheet" href="/src/site/personal.css"><link rel="stylesheet" href="/src/fileforge/documents.css"><link rel="describedby" type="text/markdown" href="/llms.txt"><link rel="manifest" href="/manifest.webmanifest"><script type="module" src="/src/site/offline.js"></script><script type="module" src="/src/site/tool-switcher.js"></script></head>')
          .replace('<fileforge-launcher></fileforge-launcher>', readFileSync(new URL('./launcher-template.html', import.meta.url), 'utf8'))
          .replace('<fileforge-workbench></fileforge-workbench>', readFileSync(new URL('./workspace-template.html', import.meta.url), 'utf8'))
          .replace('<edition-choice></edition-choice>', renderEditionChoice())
          .replace('<product-demo data-app="fileforge"></product-demo>', renderProductDemo('fileforge'))
          .replace('<product-demo data-app="repodock"></product-demo>', renderProductDemo('repodock'))
          .replace('<quick-jobs></quick-jobs>', renderQuickJobs())
          .replace('<tool-directory></tool-directory>', renderToolDirectory())
          .replace('<conversion-picker></conversion-picker>', renderConversionPicker())
          .replace('<tool-directory data-variant="home"></tool-directory>', renderToolDirectory({ compact: true, id: 'home-tools' }))
          .replace('<advanced-tool-links></advanced-tool-links>', `<p>More FileForge tools</p><div class="tool-nav" aria-label="FileForge tools">${allToolPages.map(tool => `<a href="/tools/${tool.slug}/"${path === `/tools/${tool.slug}/` ? ' aria-current="page"' : ''}><span class="tool-symbol" aria-hidden="true">${tool.symbol}</span><span>${tool.name}<small>${tool.short}</small></span></a>`).join('')}</div>`);
        if (result.includes('<fileforge-workspace></fileforge-workspace>')) {
          let workspace = readFileSync(new URL('./fileforge-workspace.html', import.meta.url), 'utf8');
          const dedicated = result.match(/data-fileforge-tool="([a-z]+)"/)?.[1];
          if (dedicated) {
            const links = allToolPages.map(tool => `<a href="/tools/${tool.slug}/"${tool.id === dedicated ? ' aria-current="page"' : ''}><span class="tool-symbol" aria-hidden="true">${tool.symbol}</span><span>${tool.name}<small>${tool.short}</small></span></a>`).join('');
            workspace = workspace.replace(/<div class="tool-tabs"[\s\S]*?<\/div>/, `<div class="tool-nav" aria-label="More FileForge tools">${links}</div>`)
              .replace('role="tabpanel" aria-labelledby="tab-image"', 'aria-labelledby="tool-title"');
          }
          if (!dedicated) workspace = workspace.replace('<div class="desktop-tip">', `<section class="additional-tool-list"><p>More FileForge tools</p>${[...advancedTools, ...documentTools].map(tool => `<a href="/tools/${tool.slug}/">${tool.name} ↗</a>`).join('')}</section><div class="desktop-tip">`);
          result = result.replace('<fileforge-workspace></fileforge-workspace>', workspace);
        }
        if (/^\/tools\/(?!workspace\/|$)/.test(path)) result = result.replace('<div class="breadcrumbs">', '<p class="forge-tool-entry">Want to connect your tools? <a href="/tools/workspace/">Open the workspace →</a></p><div class="breadcrumbs">');
        const currentTool = allToolPages.find(tool => path === `/tools/${tool.slug}/`);
        if (currentTool) {
          const facts = toolUsage[currentTool.id];
          if (facts) result = result.replace(/(<div class="page-intro">[\s\S]*?<\/h1>\s*<p>)[\s\S]*?(<\/p>)/, (_, start, end) => start + facts[0] + ' ' + facts[1] + end);
          result = result.replace(/(<div class="page-intro">[\s\S]*?<\/div>)/, `$1${renderToolUsage(currentTool)}`);
        }
        result = result.replace(/<meta name="theme-color" content="[^"]*">/, '<meta name="theme-color" content="#f5f5f7">');
        for (const name of ['title', 'description', 'image']) {
          const value = result.match(new RegExp(`<meta property="og:${name}" content="([^"]*)"`))?.[1];
          if (value) result = result.replace('</head>', `<meta name="twitter:${name}" content="${value}"></head>`);
        }
        return result.replace('</head>', `<link rel="stylesheet" href="/src/site/premium.css"><script type="module" src="/src/site/experience.js"></script>${discoveryTags(path)}</head>`);
      },
    },
  };
}
