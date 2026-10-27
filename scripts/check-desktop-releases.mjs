import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Explicit maintenance check; normal builds/tests do not depend on GitHub availability.
const apps = [
  { name: 'FileForge', repo: 'fileforge', pages: ['downloads/index.html', 'projects/fileforge/index.html', 'src/site/product-content.js'], assets: ['FileForge-Windows.zip'] },
  { name: 'Repodock', repo: 'repodock', pages: ['downloads/index.html', 'projects/repodock/index.html'], assets: ['repodock-setup.exe', 'repodock-windows-portable.zip', 'SHA256SUMS.txt'] },
];
await Promise.all(apps.map(async app => {
  const response = await fetch(`https://api.github.com/repos/UmutAlisoglu/${app.repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Alisoglu-release-check' }, signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, `${app.name}: GitHub metadata returned ${response.status}`);
  const release = await response.json();
  assert.equal(release.draft, false); assert.equal(release.prerelease, false);
  for (const path of app.pages) {
    const html = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    const refs = [...html.matchAll(new RegExp(`https://github\\.com/UmutAlisoglu/${app.repo}/releases/(?:download|tag)/([^/"'<>\\s]+)`, 'g'))].map(match => match[1]);
    assert.ok(refs.length, `${path}: no pinned ${app.name} release links`);
    assert.ok(refs.every(tag => tag === release.tag_name), `${path}: stale ${app.name} links (${[...new Set(refs)].join(', ')}); latest is ${release.tag_name}`);
  }
  await Promise.all(app.assets.map(async name => {
    const asset = release.assets.find(asset => asset.name === name);
    assert.ok(asset && asset.size > 0 && asset.state === 'uploaded', `${app.name}: missing or incomplete ${name}`);
    const download = await fetch(asset.browser_download_url, { method: 'HEAD', signal: AbortSignal.timeout(20000) });
    assert.ok(download.ok, `${app.name}: ${name} returned ${download.status}`);
    const length = Number(download.headers.get('content-length'));
    if (length) assert.equal(length, asset.size, `${app.name}: download size mismatch for ${name}`);
    console.log(`PASS ${app.name} ${release.tag_name}: ${name}, ${(asset.size / 1e6).toFixed(1)} MB, public download and website links agree.`);
  }));
}));
