import { allToolPages } from './tool-catalog.js';
export function discoveryTags(path, metadata = {}) {
  if (path === '/tools/product-kit/') return '<meta name="robots" content="noindex, follow">';
  const url = `https://alisoglu.com${path}`;
  const tool = allToolPages.find(tool => path === `/tools/${tool.slug}/`);
  const person = { '@type': 'Person', '@id': 'https://alisoglu.com/#umut', name: 'Umut Alisoglu', url: 'https://alisoglu.com/about/', email: 'mailto:umut@alisoglu.com', description: 'Software developer behind FileForge, Repodock and PCB Art Studio.', knowsAbout: ['Browser-based file tools', 'Local-first software', 'Windows desktop apps', 'PCB design', 'Gerber files'], sameAs: ['https://github.com/UmutAlisoglu'] };
  const site = { '@type': 'WebSite', '@id': 'https://alisoglu.com/#website', name: 'Umut Alisoglu', alternateName: ['Alisoglu', 'alisoglu.com'], url: 'https://alisoglu.com/', author: { '@id': person['@id'] }, description: 'Practical software by Umut Alisoglu: FileForge local file tools, Repodock for Windows and PCB Art Studio for image-to-Gerber circuit board art. Currently building a PCB AIO Tool.', inLanguage: 'en', publisher: { '@id': person['@id'] } };
  const webpage = { '@type': path === '/about/' ? 'ProfilePage' : 'WebPage', '@id': `${url}#page`, url, inLanguage: 'en', isPartOf: { '@id': site['@id'] }, about: { '@id': person['@id'] }, author: { '@id': person['@id'] }, ...(metadata.image ? { primaryImageOfPage: { '@type': 'ImageObject', url: metadata.image, contentUrl: metadata.image, width: 1200, height: 630 }, image: metadata.image } : {}), ...(path === '/about/' || path === '/' ? { mainEntity: { '@id': person['@id'] } } : {}) };
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
  if (path === '/projects/pcb-art-studio/') {
    const appID = `${url}#app`;
    graph.push({ '@type': 'WebApplication', '@id': appID, name: 'PCB Art Studio', url, description: 'Turn an image into decorative printed circuit board art: crop it on the board, map tones to solder mask, copper, ENIG gold or HASL silver and silkscreen, preview the board and download a Gerber ZIP for a PCB maker.', applicationCategory: 'DesignApplication', operatingSystem: 'Any modern browser', browserRequirements: 'JavaScript enabled', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, author: { '@id': person['@id'] }, featureList: ['Runs on your device', 'No image uploads', 'Front and back artwork', 'Solder mask colour preview', 'Gerber ZIP for JLCPCB, PCBWay or Aisler'], ...(metadata.image ? { screenshot: metadata.image } : {}) });
    webpage.mainEntity = { '@id': appID }; webpage.about = { '@id': appID };
  }
  if (path === '/projects/') graph.push({ '@type': 'ItemList', name: 'Projects by Umut Alisoglu', itemListElement: [['FileForge', '/projects/fileforge/'], ['Repodock', '/projects/repodock/'], ['PCB Art Studio', '/projects/pcb-art-studio/'], ['Skate Scape', '/projects/skate-scape/']].map(([name, href], index) => ({ '@type': 'ListItem', position: index + 1, name, url: `https://alisoglu.com${href}` })) });
  // Breadcrumbs for every page below the home page that does not have a more specific trail yet.
  if (path !== '/' && !graph.some(item => item['@type'] === 'BreadcrumbList')) {
    const sections = { '/projects/': 'Projects', '/tools/': 'Tools' };
    const parent = Object.keys(sections).find(prefix => path !== prefix && path.startsWith(prefix));
    const crumbs = [['Home', 'https://alisoglu.com/'], ...(parent ? [[sections[parent], `https://alisoglu.com${parent}`]] : []), [decode(metadata.title || '').split(' — ')[0] || path, url]];
    graph.push({ '@type': 'BreadcrumbList', itemListElement: crumbs.map(([name, item], index) => ({ '@type': 'ListItem', position: index + 1, name, item })) });
  }
  // Questions answered visibly on the page, so answer engines can quote them directly.
  const faqHtml = metadata.html?.match(/<section class="faq-section"[\s\S]*?<\/section>/)?.[0];
  if (faqHtml) {
    const text = value => decode(value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    const questions = [...faqHtml.matchAll(/<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map(([, question, answer]) => ({ '@type': 'Question', name: text(question), acceptedAnswer: { '@type': 'Answer', text: text(answer) } })).filter(item => item.name && item.acceptedAnswer.text);
    if (questions.length) graph.push({ '@type': 'FAQPage', '@id': `${url}#faq`, url, isPartOf: { '@id': webpage['@id'] }, mainEntity: questions });
  }
  if (path === '/tools/') graph.push({ '@type': 'ItemList', name: 'Free FileForge browser tools', itemListElement: allToolPages.map((tool, index) => ({ '@type': 'ListItem', position: index + 1, name: tool.name, url: `https://alisoglu.com/tools/${tool.slug}/` })) });
  return `<meta property="og:site_name" content="Umut Alisoglu"><meta name="twitter:card" content="summary_large_image"><meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"><link rel="icon" type="image/png" sizes="96x96" href="https://alisoglu.com/assets/favicon-96.png"><link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png"><link rel="alternate" type="text/markdown" href="${path}index.md"><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replaceAll('<', '\\u003c')}</script>`;
}
