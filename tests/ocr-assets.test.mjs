import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ocrAssets } from '../scripts/prepare-ocr.mjs';

test('OCR worker, compatibility cores and three language packs match reviewed input bytes', async () => {
  for (const asset of ocrAssets) {
    const metadata = JSON.parse(await readFile(`node_modules/${asset.package}/package.json`, 'utf8'));
    assert.equal(metadata.version, asset.version);
    const bytes = await readFile(`node_modules/${asset.package}/${asset.file}`);
    assert.equal(bytes.length, asset.bytes, asset.target);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.target);
  }
  assert.deepEqual(ocrAssets.filter(asset => asset.target.startsWith('lang/')).map(asset => asset.target), ['lang/eng.traineddata.gz', 'lang/deu.traineddata.gz', 'lang/tur.traineddata.gz']);
});
