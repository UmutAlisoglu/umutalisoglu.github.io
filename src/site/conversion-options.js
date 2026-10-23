import { findTools, escapeHtml } from './tool-catalog.js';
import { toolUsage } from './tool-usage.js';

export const conversionSources = [
  ['docx', 'Word (DOCX)'], ['pptx', 'PowerPoint (PPTX)'], ['xlsx', 'Excel (XLSX)'],
  ['csv', 'CSV'], ['json', 'JSON'], ['txt', 'Text (TXT)'], ['pdf', 'PDF'],
  ['jpg', 'JPG / JPEG'], ['png', 'PNG'], ['webp', 'WebP'], ['gif', 'GIF'], ['bmp', 'BMP'],
  ['heic', 'HEIC'], ['heif', 'HEIF'],
];
const outputs = [['pdf', 'PDF'], ['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP'], ['svg', 'SVG'], ['txt', 'Text (TXT)'], ['json', 'JSON'], ['csv', 'CSV']];

// Resolve through the same directional catalogue used by search. Never guess a
// converter from shared keywords, or advertise an unsupported output format.
export function conversionFor(source, target) {
  if (!conversionSources.some(([id]) => id === source) || !outputs.some(([id]) => id === target) || source === target) return null;
  const matches = findTools(`${source} to ${target}`);
  if (matches.length !== 1) return null;
  const tool = matches[0];
  let href = tool.href || `/tools/${tool.slug}/`;
  if (['image', 'image-pdf', 'pdf-images', 'data'].includes(tool.id)) {
    const url = new URL(href, 'https://alisoglu.com');
    url.searchParams.set('format', target); href = url.pathname + url.search;
  }
  return { tool, href, facts: toolUsage[tool.id === 'image-pdf' ? 'image' : tool.id].slice(0, 2) };
}
export function conversionTargets(source) {
  return outputs.filter(([target]) => conversionFor(source, target));
}

export function renderConversionPicker() {
  const initial = conversionFor('docx', 'pdf');
  return `<section class="conversion-picker" data-conversion-picker aria-labelledby="conversion-picker-title">
  <div class="conversion-picker-heading"><div><p class="eyebrow">QUICK START</p><h2 id="conversion-picker-title">Choose a conversion</h2></div><p>Pick your file type and see the available outputs.</p></div>
  <p data-conversion-fallback class="conversion-fallback">Start with <a href="/tools/word-to-pdf/">Word → PDF</a>, <a href="/tools/powerpoint-to-pdf/">PowerPoint → PDF</a> or <a href="/tools/image-converter/?format=pdf">Images → PDF</a>. More tasks are listed below.</p>
  <form data-conversion-form hidden>
    <div class="conversion-fields"><label>From<select name="from">${conversionSources.map(([id, label]) => `<option value="${id}">${escapeHtml(label)}</option>`).join('')}</select></label><span class="conversion-direction" aria-hidden="true">→</span><label>To<select name="to"><option value="pdf">PDF</option></select></label><button class="button primary" type="submit">Open converter <span aria-hidden="true">↗</span></button></div>
    <div class="conversion-facts" role="status" aria-live="polite" aria-atomic="true"><strong data-conversion-name>${escapeHtml(initial.tool.name)}</strong><p data-conversion-limit>${escapeHtml(initial.facts[0])}</p><p data-conversion-note>${escapeHtml(initial.facts[1])}</p></div>
  </form>
  <p class="conversion-picker-footnote">No file is selected here. Conversion starts inside the tool. For editing, compression and other tasks, browse the tools below.</p>
</section>`;
}
