import html2canvas from 'html2canvas';
import { prepareOffice } from './office-archive.js';

const stage = document.querySelector('#stage');
const protocol = 'fileforge-office-v1';
let started = false, pixels = 0;
const send = (token, type, payload = {}) => parent.postMessage({ protocol, token, type, ...payload }, location.origin);

async function settle(element) {
  for (const link of element.querySelectorAll('a')) link.removeAttribute('href');
  await document.fonts.ready;
  await Promise.all([...element.querySelectorAll('img')].map(img => img.decode().catch(() => {})));
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
async function capture(element, token, pages, pageHeight) {
  await settle(element);
  const width = Math.ceil(element.getBoundingClientRect().width);
  const height = Math.ceil(Math.max(element.scrollHeight, element.getBoundingClientRect().height));
  if (!width || !height || width > 2400 || height > 24000) throw new Error('A page is too large for browser export.');
  const slice = pageHeight || height;
  const count = Math.ceil(height / slice);
  if (pages.length + count > 20) throw new Error('This document produces more than 20 pages. Split it into smaller documents.');
  const scale = Math.min(1.5, 2400 / width);
  pixels += Math.ceil(width * scale) * Math.ceil(height * scale);
  if (pixels > 60e6) throw new Error('This document exceeds the 60 megapixel render limit. Try fewer pages.');
  const canvas = await html2canvas(element, { scale, width, height, windowWidth: Math.max(1280, width + 40), windowHeight: height + 40, backgroundColor: '#ffffff', logging: false, useCORS: false, allowTaint: false, imageTimeout: 10000 });
  try {
    for (let index = 0; index < count; index++) {
      const part = document.createElement('canvas');
      part.width = canvas.width; part.height = Math.round(slice * scale);
      const ctx = part.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, part.width, part.height);
      const y = Math.round(index * slice * scale), crop = Math.min(part.height, canvas.height - y);
      ctx.drawImage(canvas, 0, y, canvas.width, crop, 0, 0, canvas.width, crop);
      const blob = await new Promise(resolve => part.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('This browser could not prepare the page image.');
      pages.push({ blob, width, height: slice }); part.width = part.height = 1;
      send(token, 'progress', { message: `Prepared page ${pages.length}…` });
    }
  } finally { canvas.width = canvas.height = 1; }
}
window.addEventListener('message', async event => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.protocol !== protocol || event.data.type !== 'render' || started) return;
  started = true;
  const { token, kind, file } = event.data;
  try {
    if (!(file instanceof File) || !file.size || file.size > 10e6) throw new Error('Choose one Office file up to 10 MB.');
    const cleaned = prepareOffice(await file.arrayBuffer(), kind);
    const pages = [];
    let warning = cleaned.removed ? 'Linked external content was left out. ' : '';
    if (kind === 'word-pdf') {
      const { renderAsync } = await import('docx-preview');
      await renderAsync(cleaned.bytes, stage, stage, { inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: false, renderAltChunks: false, renderComments: false, renderChanges: false, useBase64URL: true });
      const sections = [...stage.querySelectorAll('section.docx')];
      if (!sections.length || sections.length > 20) throw new Error('No readable pages, or more than 20 pages.');
      for (const section of sections) {
        const style = getComputedStyle(section);
        const pageHeight = Math.ceil(parseFloat(style.minHeight) || 1123);
        if (section.scrollHeight > pageHeight + 2) warning = 'Long sections are split into page images; page breaks may differ. ' + warning;
        await capture(section, token, pages, pageHeight);
      }
    } else {
      const { parseZip, buildPresentation, renderSlide } = await import('@aiden0z/pptx-renderer');
      const presentation = buildPresentation(await parseZip(cleaned.bytes.buffer, { maxEntries: 2000, maxEntryUncompressedBytes: 20e6, maxTotalUncompressedBytes: 80e6, maxMediaBytes: 60e6, maxConcurrency: 2 }));
      if (!presentation.slides.length || presentation.slides.length > 20) throw new Error('Choose a presentation with 1–20 slides.');
      for (const slide of presentation.slides) {
        let errors = 0;
        const handle = renderSlide(presentation, slide, { externalMedia: 'block', pdfjs: false, onNavigate() {}, onNodeError() { errors++; } });
        try { stage.replaceChildren(handle.element); await handle.ready; await capture(handle.element, token, pages); }
        finally { handle.dispose(); stage.replaceChildren(); }
        if (errors) throw new Error('Some slide elements could not be rendered. Export this deck from PowerPoint instead.');
      }
    }
    if (pages.reduce((size, page) => size + page.blob.size, 0) > 60e6) throw new Error('The page images exceed 60 MB. Try a smaller document.');
    send(token, 'rendered', { pages, warning });
  } catch (error) { send(token, 'error', { message: error.message || 'This document could not be rendered. Try exporting from its original app.' }); }
});
parent.postMessage({ protocol, type: 'ready' }, location.origin);
