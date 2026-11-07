// Builds the card off the main thread so typing stays smooth.
import opentype from 'opentype.js';
import { zipSync, strToU8 } from 'fflate';
import interBlack from '@fontsource/inter/files/inter-latin-900-normal.woff?url';
import interBlackExt from '@fontsource/inter/files/inter-latin-ext-900-normal.woff?url';
import interBold from '@fontsource/inter/files/inter-latin-700-normal.woff?url';
import interBoldExt from '@fontsource/inter/files/inter-latin-ext-700-normal.woff?url';
import interMedium from '@fontsource/inter/files/inter-latin-500-normal.woff?url';
import interMediumExt from '@fontsource/inter/files/inter-latin-ext-500-normal.woff?url';
import monoBold from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-800-normal.woff?url';
import monoBoldExt from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-ext-800-normal.woff?url';
import { Face } from './text.js';
import { buildCard } from './card.js';
import { cardSvg, layerSvg } from './preview.js';
import { fabricationFiles, checkCard } from './fab.js';

const fontFile = async url => opentype.parse(await (await fetch(url)).arrayBuffer());
const facePair = async (a, b) => new Face(await Promise.all([fontFile(a), fontFile(b)]));
const ready = Promise.all([facePair(interBlack, interBlackExt), facePair(interBold, interBoldExt), facePair(interMedium, interMediumExt), facePair(monoBold, monoBoldExt)])
  .then(([black, bold, medium, mono]) => ({ black, bold, medium, mono }));

let card = null;
let look = { colour: 'blue', finish: 'silver', view: 'board' };

function render() {
  const draw = side => look.view === 'board' ? cardSvg(card, side, { ...look, id: `nfc-${side}` }) : layerSvg(card, side, look.view);
  return { front: draw('front'), back: draw('back'), notes: card.notes, qr: card.qr };
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    const faces = await ready;
    if (type === 'build') {
      look = { ...look, ...data.look };
      const t0 = performance.now();
      card = buildCard(faces, data.options);
      self.postMessage({ id, type, ...render(), ms: Math.round(performance.now() - t0) });
    } else if (type === 'look') {
      look = { ...look, ...data.look };
      if (card) self.postMessage({ id, type, ...render() });
    } else if (type === 'files') {
      const check = checkCard(card);
      const files = fabricationFiles(card, { name: data.name, colour: look.colour, finish: look.finish, check });
      const gerbers = Object.fromEntries(Object.entries(files).filter(([k]) => !/\.csv$/.test(k)).map(([k, v]) => [k, strToU8(v)]));
      const zip = zipSync({ ...gerbers }, { level: 6 });
      self.postMessage({ id, type, zip, bom: files[`${data.name}-BOM.csv`], cpl: files[`${data.name}-CPL.csv`], check }, [zip.buffer]);
    }
  } catch (error) {
    self.postMessage({ id, type: 'error', message: String(error && error.message || error) });
  }
};
