// Shared, visible selection facts. Keep these aligned with each engine's checks.
export const toolUsage = {
  heic: ['HEIC or HEIF · one photo up to 20 MB / 24 megapixels.', 'First image only. No HDR, depth data or Live Photo video; unsupported variants may need a JPG export from Photos.', false],
  compress: ['One unlocked PDF up to 25 MB / 200 pages.', 'Recompresses ordinary RGB JPEG images only. Text-only PDFs may barely shrink. No forms or signatures.', false],
  split: ['One unlocked PDF up to 25 MB / 200 pages.', 'Page numbers and ranges into one PDF per export. No forms, signatures or bookmark splitting.', false],
  metadata: ['JPG or PNG · one file up to 20 MB.', 'Removes location, camera and descriptive tags, preserving pixels, colour profiles and orientation. Does not hide faces or visible text.', false],
  image: ['JPG, PNG, WebP, GIF or BMP · up to 50 images · 20 MB each / 100 MB total.', 'Animated images use the first frame; no TIFF input.', true],
  organize: ['1–20 unlocked PDFs · 25 MB each / 75 MB total · up to 200 pages.', 'Page editing can affect forms, bookmarks and signatures.', true],
  spreadsheet: ['XLSX or UTF-8 CSV · up to 10 MB.', 'Creates PDF tables; charts and Excel print layouts aren’t preserved.', true],
  merge: ['2–20 unlocked PDFs · 25 MB each / 75 MB total.', 'Password-protected files need an unlocked copy.', true],
  video: ['MP4, MOV, MKV, WebM, AVI or M4V · one file up to 100 MB.', 'Two-pass MP4 encoding; 15-minute job limit. Very small targets reduce quality.', true],
  background: ['JPG, PNG, WebP, GIF or BMP · one image up to 20 MB / 12 megapixels.', 'Best with one clear subject. Fine edges may need the mask editor.', true],
  svg: ['JPG, PNG, WebP, GIF or BMP · one image up to 20 MB / 40 megapixels.', 'Traces shapes; a photograph becomes a vector approximation.', true],
  crop: ['JPG, PNG, WebP, GIF or BMP · one image up to 20 MB / 40 megapixels.', 'Animated images use the first frame.', true],
  'pdf-images': ['One unlocked PDF up to 25 MB · export up to 50 selected pages / 150 MB output.', 'Renders pages into pixels; this doesn’t edit the PDF’s text.', true],
  text: ['JPG, PNG, WebP, GIF or BMP ≤20 MB / 12 MP; PDF ≤25 MB / 10 selected pages.', 'English, German or Turkish. Exports editable text, not a searchable PDF.', false],
  screenshot: ['PNG, JPG or WebP · one image up to 20 MB / 20 megapixels.', 'Frames an image you choose; it doesn’t capture your screen.', false],
  scanner: ['JPG, PNG, WebP, GIF or BMP · one photo up to 20 MB / 12 megapixels.', 'Manual page corners. PDF export is an image page, not searchable text.', false],
};

export function renderToolUsage(tool) {
  const facts = toolUsage[tool.id];
  if (!facts) return '';
  const email = `mailto:umut@alisoglu.com?subject=${encodeURIComponent(`FileForge feedback: ${tool.name}`)}`;
  return `<aside class="tool-input-facts" aria-label="Help with this tool"><div><a href="${email}">Report a problem by email ↗</a>${facts[2] ? '<a href="/projects/fileforge/#desktop">Bigger files? FileForge for Windows →</a>' : ''}</div></aside>`;
}
