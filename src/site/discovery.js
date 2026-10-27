import { allToolPages } from './tool-catalog.js';
export function discoveryTags(path) {
  if (path === '/tools/product-kit/') return '<meta name="robots" content="noindex, follow">';
  const url = `https://alisoglu.com${path}`;
  const tool = allToolPages.find(tool => path === `/tools/${tool.slug}/`);
  const person = { '@type': 'Person', '@id': 'https://alisoglu.com/#umut', name: 'Umut Alisoglu', url: 'https://alisoglu.com/about/', sameAs: ['https://github.com/UmutAlisoglu'] };
  const site = { '@type': 'WebSite', '@id': 'https://alisoglu.com/#website', name: 'Umut Alisoglu', alternateName: ['Alisoglu', 'alisoglu.com'], url: 'https://alisoglu.com/', author: { '@id': person['@id'] }, description: 'Practical software by Umut Alisoglu: FileForge local file tools and Repodock for Windows. Currently building a PCB AIO Tool.' };
  const webpage = { '@type': path === '/about/' ? 'ProfilePage' : 'WebPage', '@id': `${url}#page`, url, isPartOf: { '@id': site['@id'] }, about: { '@id': person['@id'] }, ...(path === '/about/' || path === '/' ? { mainEntity: { '@id': person['@id'] } } : {}) };
  const graph = [person, site, webpage];
  if (tool) {
    graph.push({ '@type': 'WebApplication', name: `${tool.name} — FileForge`, url, description: tool.description, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any modern browser', browserRequirements: 'JavaScript enabled', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, author: { '@id': person['@id'] }, featureList: ['Runs on your device', 'No file uploads', 'No account required', 'No saved conversion history'] });
    graph.push({ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://alisoglu.com/' }, { '@type': 'ListItem', position: 2, name: 'Tools', item: 'https://alisoglu.com/tools/' }, { '@type': 'ListItem', position: 3, name: tool.name, item: url }] });
  }
  if (path === '/tools/') graph.push({ '@type': 'ItemList', name: 'Free FileForge browser tools', itemListElement: allToolPages.map((tool, index) => ({ '@type': 'ListItem', position: index + 1, name: tool.name, url: `https://alisoglu.com/tools/${tool.slug}/` })) });
  return `<meta property="og:site_name" content="Umut Alisoglu"><meta name="twitter:card" content="summary_large_image"><meta name="robots" content="index, follow, max-image-preview:large"><link rel="icon" type="image/png" sizes="96x96" href="https://alisoglu.com/assets/favicon-96.png"><link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png"><link rel="alternate" type="text/markdown" href="${path}index.md"><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replaceAll('<', '\\u003c')}</script>`;
}
