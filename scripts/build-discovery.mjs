import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { allToolPages, toolCatalog } from '../src/site/tool-catalog.js';
import { toolUsage } from '../src/site/tool-usage.js';
import { sitePaths } from '../src/site/templates.js';

const privacy = 'FileForge is free to use without an account. Selected files, pasted text and results are processed on the visitor’s device, not uploaded to a conversion server or saved by this website. Download results before leaving the tab. Ordinary page visits download code and engines from the host, which receives connection information. Optional settings are stored locally only after opt-in; optional offline mode caches public code, not visitor files. The separately hosted game uses its own storage and game-data downloads.';
const summaries = {
  '/': ['Umut Alisoglu', 'Umut Alisoglu makes FileForge browser file tools, Repodock for local GitHub projects on Windows, and Skate Scape, an unofficial skating fan game in the 2009 RuneScape world. Currently building a PCB AIO Tool (23 October 2026).'],
  '/about/': ['About Umut Alisoglu', 'Umut Alisoglu is the person behind FileForge, Repodock and Skate Scape. His public projects include browser file conversion, a Windows project launcher, and an unofficial RuneScape skating fan game. As of 23 October 2026, he is building a PCB AIO Tool. Public profile: https://github.com/UmutAlisoglu. Contact: umut@alisoglu.com.'],
  '/tools/': ['Free FileForge browser tools', toolCatalog.map(tool => `- [${tool.name}](https://alisoglu.com/tools/${tool.slug}/): ${tool.description}`).join('\n')],
  '/tools/workspace/': ['FileForge connected workspace', 'Choose a file and the workspace suggests compatible tools. Results pass to the next tool in memory, without uploading or downloading and reselecting. Clear all releases the current session.'],
  '/privacy/': ['Privacy and file handling', privacy + '\n\nRead the full privacy notes for image metadata, optional local storage, hosting, the separate game and external links. This site uses GitHub Pages. It adds no analytics or advertising scripts.'],
  '/projects/': ['Projects', 'FileForge: free browser file tools and a separate Windows app. Repodock: a Windows app to run local GitHub projects. Skate Scape: an unofficial fan skating project.'],
  '/projects/skate-scape/': ['Skate Scape — fan project', 'An unofficial fan-made browser skating game with tricks and combos. Best played on a computer with keyboard or gamepad. First use downloads game data from an external source; game data and progress use local browser storage. It is a fan project, not an official release or endorsement.'],
  '/contact/': ['Contact Umut Alisoglu', 'Email: umut@alisoglu.com. The feedback form prepares a draft locally. Visitors choose whether to send it using their own email app or review and submit it on GitHub. Public GitHub issues should not include private files or passwords.'],
};
const full = [];
for (const path of sitePaths) {
  const tool = allToolPages.find(tool => path === `/tools/${tool.slug}/`);
  const html = (await readFile(`dist${path}index.html`, 'utf8')).replace(/href="\/tools\/_assets\/llms-[^"]+\.txt"/g, 'href="/llms.txt"');
  await writeFile(`dist${path}index.html`, html);
  const title = tool?.name || summaries[path]?.[0] || html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replaceAll('&amp;', '&') || 'Alisoglu';
  const description = tool?.description || summaries[path]?.[1] || html.match(/<meta name="description" content="([^"]*)"/)?.[1]?.replaceAll('&amp;', '&') || '';
  const facts = tool && toolUsage[tool.id];
  let content = `# ${title}\n\n${description}\n\nOriginal page: https://alisoglu.com${path}\n`;
  if (facts) content += `\n## Formats and limits\n\n${facts[0]}\n\n${facts[1]}\n`;
  if (path.startsWith('/tools/')) content += `\n## Cost and file handling\n\n${privacy}\n`;
  content += '\n## Links\n\n- [Privacy](https://alisoglu.com/privacy/)\n- [Contact](https://alisoglu.com/contact/)\n- [Tools](https://alisoglu.com/tools/)\n';
  await mkdir(`dist${path}`, { recursive: true }); await writeFile(`dist${path}index.md`, content);
  full.push(content);
}
await cp('llms.txt', 'dist/llms.txt');
await cp('llms.txt', 'dist/llm.txt');
await writeFile('dist/llms-full.txt', full.join('\n---\n\n'));
console.log('Discovery ready: llms.txt, llm.txt compatibility alias, llms-full.txt and Markdown summaries for all public pages.');
