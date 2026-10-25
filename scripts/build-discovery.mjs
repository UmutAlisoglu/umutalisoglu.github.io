import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { allToolPages, toolCatalog } from '../src/site/tool-catalog.js';
import { toolUsage } from '../src/site/tool-usage.js';
import { sitePaths } from '../src/site/templates.js';

const privacy = 'FileForge is free to use without an account. Selected files, pasted text and results are processed on the visitor’s device, not uploaded to a conversion server or saved by this website. Download results before leaving the tab. Ordinary page visits download code and engines from the host, which receives connection information. Optional settings are stored locally only after opt-in; optional offline mode caches public code, not visitor files. The separately hosted game uses its own storage and game-data downloads.';
const summaries = {
  '/projects/routeboard/': ['Routeboard — A clearer next step', 'Routeboard 1.0.0, released 25 October 2026, builds branching troubleshooting, onboarding and checklist guides on the visitor’s device. Plain-text steps, choices, live walkthrough, route checks, JSON project saves and script-free self-contained HTML export. Only connected steps are exported; project JSON keeps drafts. Up to 80 steps, 8 choices per step and 2 MB project JSON. Free, MIT licensed, no uploads, accounts or saved history. Portable editor works offline. App: https://alisoglu.com/routeboard/. Source: https://github.com/UmutAlisoglu/routeboard.'],
  '/projects/handback/': ['Handback — A clear project handover', 'Handback 1.0.0, released 25 October 2026, collects summaries, notes, tasks, decisions, questions, links and screenshots in a project handover. Local editor with JSON project saves, self-contained script-free HTML packets and Markdown exports. Screenshots are embedded in HTML/JSON, not Markdown. Up to 8 normalized screenshots and 25 MB project JSON. Free, MIT licensed, no uploads, accounts or saved history. Portable editor works offline. App: https://alisoglu.com/handback/. Source: https://github.com/UmutAlisoglu/handback.'],
  '/': ['Umut Alisoglu', 'Umut Alisoglu builds practical software: Rowglass for local table comparison, FileForge browser file tools and Repodock for local GitHub projects on Windows. Currently building a PCB AIO Tool.'],
  '/about/': ['About Umut Alisoglu', 'Umut Alisoglu is the person behind Rowglass, FileForge and Repodock. His public software projects include private table comparison, browser file conversion and a Windows project launcher. He is currently building a PCB AIO Tool. Public profile: https://github.com/UmutAlisoglu. Contact: umut@alisoglu.com.'],
  '/tools/': ['Free FileForge browser tools', toolCatalog.map(tool => `- [${tool.name}](https://alisoglu.com/tools/${tool.slug}/): ${tool.description}`).join('\n')],
  '/tools/workspace/': ['FileForge connected workspace', 'Choose a file and the workspace suggests compatible tools. Results pass to the next tool in memory, without uploading or downloading and reselecting. Clear all releases the current session.'],
  '/privacy/': ['Privacy and file handling', privacy + '\n\nRead the full privacy notes for image metadata, optional local storage, hosting, the separate game and external links. This site uses GitHub Pages. It adds no analytics or advertising scripts.'],
  '/projects/': ['Projects', 'Rowglass: private CSV/TSV comparison with keyed matching and self-contained reports. FileForge: free browser file tools and a separate Windows app. Repodock: a Windows app to run local GitHub projects. Other experiments include Skate Scape, an unofficial fan skating project.'],
  '/projects/rowglass/': ['Rowglass — See what changed', 'Rowglass 1.0.0, released 25 October 2026, compares two CSV/TSV exports on the visitor’s device. Match by one or two columns, flag duplicate/empty IDs, inspect changed values, filter and search rows, and save self-contained HTML reports or CSV/JSON exports. Free, MIT licensed, no upload or saved history. Up to 10 MB, 20,000 rows, 200 columns and 1,000,000 cells per table. Export XLSX to CSV first. Portable browser ZIP works offline without installation or a server. App: https://alisoglu.com/rowglass/. Source and downloads: https://github.com/UmutAlisoglu/rowglass.'],
  '/projects/fileforge/': ['FileForge browser and Windows tools', 'Free browser file tools and FileForge Windows 0.3.0, released 23 October 2026. The Windows x64 ZIP bundles the connected workspace and its local engines, plus nine native converters for larger jobs. WebView2 is required; native video needs installed FFmpeg/FFprobe. Extract the full ZIP and keep the workspace folder beside FileForge.exe. Office PDF exports use flattened page images and may differ from Microsoft Office. Download: https://github.com/UmutAlisoglu/fileforge/releases/tag/v0.3.0.'],
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
