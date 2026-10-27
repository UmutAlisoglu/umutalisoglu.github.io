import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sitePaths, retiredPaths } from '../src/site/templates.js';
const titles = new Set(), descriptions = new Set();
const sitemap = await readFile('dist/sitemap.xml', 'utf8');
for (const path of sitePaths) {
  const html = await readFile(`dist${path}index.html`, 'utf8');
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1], description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
  assert.ok(title && description, `Missing title/description: ${path}`);
  assert.ok(!titles.has(title), `Duplicate title: ${path}`); titles.add(title);
  assert.ok(!descriptions.has(description), `Duplicate description: ${path}`); descriptions.add(description);
  assert.ok(html.includes(`rel="canonical" href="https://alisoglu.com${path}"`), `Canonical: ${path}`);
  assert.ok(sitemap.includes(`<loc>https://alisoglu.com${path}</loc>`), `Sitemap: ${path}`);
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])['@graph'];
  const page = graph.find(item => item['@id'] === `https://alisoglu.com${path}#page`);
  assert.ok(page?.name && page.description, `Page identity: ${path}`);
  for (const reference of [page.mainEntity].flat().filter(Boolean)) assert.ok(graph.some(item => item['@id'] === reference['@id']), `Unresolved entity: ${path}`);
  for (const app of graph.filter(item => item['@type'] === 'SoftwareApplication')) {
    assert.ok(html.includes(app.downloadUrl), `Download metadata differs from page: ${path}`);
    assert.ok(html.includes(app.releaseNotes), `Release metadata differs from page: ${path}`);
    assert.ok(!app.aggregateRating && !app.review, 'No invented ratings or reviews');
  }
  const markdown = await readFile(`dist${path}index.md`, 'utf8');
  assert.ok(markdown.includes(`Original page: https://alisoglu.com${path}`), `Markdown source: ${path}`);
}
for (const path of retiredPaths) {
  const html = await readFile(`dist${path}index.html`, 'utf8');
  assert.match(html, /name="robots" content="noindex, follow"/);
  assert.ok(!sitemap.includes(`<loc>https://alisoglu.com${path}</loc>`));
}
const guide = await readFile('dist/llms-full.txt', 'utf8');
assert.match(guide, /Repodock 0\.3\.0/); assert.doesNotMatch(guide, /Product Kit Studio/);
console.log(`PASS ${sitePaths.length} public pages: unique metadata, canonical URLs, sitemap, linked structured entities, app download facts and Markdown summaries. Retired pages stay noindex.`);
