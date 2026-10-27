import { allToolPages } from './tool-catalog.js';
export function discoveryTags(path, metadata = {}) {
  if (path === '/tools/product-kit/') return '<meta name="robots" content="noindex, follow">';
  const url = `https://alisoglu.com${path}`;
  const tool = allToolPages.find(tool => path === `/tools/${tool.slug}/`);
  const person = { '@type': 'Person', '@id': 'https://alisoglu.com/#umut', name: 'Umut Alisoglu', url: 'https://alisoglu.com/about/', sameAs: ['https://github.com/UmutAlisoglu'] };
  const site = { '@type': 'WebSite', '@id': 'https://alisoglu.com/#website', name: 'Umut Alisoglu', alternateName: ['Alisoglu', 'alisoglu.com'], url: 'https://alisoglu.com/', author: { '@id': person['@id'] }, description: 'Practical software by Umut Alisoglu: FileForge local file tools and Repodock for Windows. Currently building a PCB AIO Tool.' };
  const webpage = { '@type': path === '/about/' ? 'ProfilePage' : 'WebPage', '@id': `${url}#page`, url, isPartOf: { '@id': site['@id'] }, about: { '@id': person['@id'] }, ...(path === '/about/' || path === '/' ? { mainEntity: { '@id': person['@id'] } } : {}) };
  const graph = [person, site, webpage];
  const decode = text => text?.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
  if (metadata.title) webpage.name = decode(metadata.title);
  if (metadata.description) webpage.description = decode(metadata.description);
  if (tool) {
    const appID = `${url}#app`;
    webpage.mainEntity = { '@id': appID }; webpage.about = { '@id': appID };
    graph.push({ '@type': 'WebApplication', '@id': appID, name: `${tool.name} — FileForge`, url, description: tool.description, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any modern browser', browserRequirements: 'JavaScript enabled', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, author: { '@id': person['@id'] }, featureList: ['Runs on your device', 'No file uploads', 'No account required', 'No saved conversion history'] });
    graph.push({ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://alisoglu.com/' }, { '@type': 'ListItem', position: 2, name: 'Tools', item: 'https://alisoglu.com/tools/' }, { '@type': 'ListItem', position: 3, name: tool.name, item: url }] });
  }
  const desktop = {
    '/projects/fileforge/': { name: 'FileForge for Windows', repo: 'fileforge', asset: 'FileForge-Windows.zip', description: 'Local file tools with a bundled connected workspace and native converters for larger files.' },
    '/projects/repodock/': { name: 'Repodock', repo: 'repodock', asset: 'repodock-setup.exe', description: 'Manage local GitHub projects, review run commands, start and stop processes, and inspect logs.' },
  }[path];
  if (desktop) {
    const appID = `${url}#windows-app`, release = `https://github.com/UmutAlisoglu/${desktop.repo}/releases`;
    graph.push({ '@type': 'SoftwareApplication', '@id': appID, name: desktop.name, url, description: desktop.description, operatingSystem: 'Windows (x64)', applicationCategory: desktop.repo === 'repodock' ? 'DeveloperApplication' : 'UtilitiesApplication', softwareVersion: '0.3.0', downloadUrl: `${release}/download/v0.3.0/${desktop.asset}`, releaseNotes: `${release}/tag/v0.3.0`, isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, author: { '@id': person['@id'] } });
    webpage.mainEntity = { '@id': appID }; webpage.about = { '@id': appID };
    graph.push({ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: site.url }, { '@type': 'ListItem', position: 2, name: 'Projects', item: 'https://alisoglu.com/projects/' }, { '@type': 'ListItem', position: 3, name: desktop.repo === 'fileforge' ? 'FileForge' : 'Repodock', item: url }] });
    if (desktop.repo === 'fileforge') {
      const browserID = 'https://alisoglu.com/tools/workspace/#app';
      graph.push({ '@type': 'WebApplication', '@id': browserID, name: 'FileForge browser workspace', url: 'https://alisoglu.com/tools/workspace/', description: 'Free local image, PDF, document and video tools with guided jobs and in-memory result handoffs.', operatingSystem: 'Any modern browser', applicationCategory: 'UtilitiesApplication', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, author: { '@id': person['@id'] } });
      webpage.mainEntity = [{ '@id': browserID }, { '@id': appID }];
    }
  }
  if (path === '/tools/') graph.push({ '@type': 'ItemList', name: 'Free FileForge browser tools', itemListElement: allToolPages.map((tool, index) => ({ '@type': 'ListItem', position: index + 1, name: tool.name, url: `https://alisoglu.com/tools/${tool.slug}/` })) });
  return `<meta property="og:site_name" content="Umut Alisoglu"><meta name="twitter:card" content="summary_large_image"><meta name="robots" content="index, follow, max-image-preview:large"><link rel="icon" type="image/png" sizes="96x96" href="https://alisoglu.com/assets/favicon-96.png"><link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png"><link rel="alternate" type="text/markdown" href="${path}index.md"><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replaceAll('<', '\\u003c')}</script>`;
}
