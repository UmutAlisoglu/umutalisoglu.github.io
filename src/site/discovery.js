import { allToolPages } from './tool-catalog.js';
export function discoveryTags(path) {
  const url = `https://alisoglu.com${path}`;
  const tool = allToolPages.find(tool => path === `/tools/${tool.slug}/`);
  const person = { '@type': 'Person', '@id': 'https://alisoglu.com/#umut', name: 'Umut Alisoglu', url: 'https://alisoglu.com/about/', sameAs: ['https://github.com/UmutAlisoglu'] };
  const site = { '@type': 'WebSite', '@id': 'https://alisoglu.com/#website', name: 'Umut Alisoglu', url: 'https://alisoglu.com/', author: { '@id': person['@id'] }, description: 'Personal projects, free browser tools and a fan-made skating game.' };
  const graph = [person, site];
  if (tool) {
    graph.push({ '@type': 'WebApplication', name: `${tool.name} — FileForge`, url, description: tool.description, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any modern browser', browserRequirements: 'JavaScript enabled', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, author: { '@id': person['@id'] }, featureList: ['Runs on your device', 'No file uploads', 'No account required', 'No saved conversion history'] });
    graph.push({ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://alisoglu.com/' }, { '@type': 'ListItem', position: 2, name: 'Tools', item: 'https://alisoglu.com/tools/' }, { '@type': 'ListItem', position: 3, name: tool.name, item: url }] });
  }
  if (path === '/tools/') graph.push({ '@type': 'ItemList', name: 'Free FileForge browser tools', itemListElement: allToolPages.map((tool, index) => ({ '@type': 'ListItem', position: index + 1, name: tool.name, url: `https://alisoglu.com/tools/${tool.slug}/` })) });
  return `<link rel="alternate" type="text/markdown" href="${path}index.md"><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replaceAll('<', '\\u003c')}</script>`;
}
