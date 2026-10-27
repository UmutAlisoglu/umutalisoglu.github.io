// A task may share an engine with another task. Keep this catalogue in one place
// so search, the static directory and navigation describe the same tools.
export const toolPages = [
  { id: 'image', slug: 'image-converter', name: 'Image studio', symbol: '▧', short: 'Convert, resize & batch', description: 'Convert JPG, PNG and WebP, resize photos or process a whole batch.', color: 'pink', category: 'Images', keywords: 'image photo picture convert converter conversion jpg jpeg png webp gif bmp resize scale dimensions resolution compress compression batch zip' },
  { id: 'organize', slug: 'pdf-organizer', name: 'PDF organizer', symbol: '▦', short: 'Preview, reorder & rotate', description: 'Preview PDF pages, put them in order and keep only the pages you need.', color: 'purple', category: 'PDFs', keywords: 'pdf document page organize organise reorder rearrange rotate rotation delete remove extract split' },
  { id: 'spreadsheet', slug: 'excel-to-pdf', name: 'Excel → PDF', symbol: '▤', short: 'Tables ready to share', description: 'Turn visible XLSX sheets or CSV data into readable PDF tables.', color: 'mint', category: 'Documents', keywords: 'excel spreadsheet xlsx csv sheet table data document pdf conversion convert' },
  { id: 'merge', slug: 'merge-pdf', name: 'Merge PDFs', symbol: '⊕', short: 'One tidy document', description: 'Combine separate PDFs in the order you choose.', color: 'yellow', category: 'PDFs', keywords: 'pdf merge combine join append together document' },
  { id: 'video', slug: 'video-compressor', name: 'Video compressor', symbol: '▷', short: 'A smaller MP4', description: 'Choose a size target and compress a short video on your device.', color: 'blue', category: 'Video', keywords: 'video mp4 compress compressor compression shrink smaller reduce file size movie clip h264' },
];

export const advancedTools = [
  { id: 'background', slug: 'remove-background', name: 'Remove background', symbol: '◐', short: 'A clean, transparent PNG', description: 'Keep the subject and remove the background from a photo.', color: 'mint', category: 'Images', keywords: 'image photo picture background bg remove remover removal transparent transparency cutout cut out erase person portrait product' },
  { id: 'svg', slug: 'image-to-svg', name: 'Image → SVG', symbol: '◇', short: 'Pixels into vector shapes', description: 'Trace logos, icons and drawings into an editable SVG.', color: 'purple', category: 'Images', keywords: 'image photo picture png jpg jpeg svg vector vectorize vectorise trace tracing logo icon drawing illustration convert converter' },
  { id: 'crop', slug: 'crop-image', name: 'Crop an image', symbol: '⌗', short: 'Keep the part you need', description: 'Crop a photo or screenshot with a free selection or a fixed ratio.', color: 'pink', category: 'Images', keywords: 'image photo picture crop cropping screenshot cut frame ratio aspect square portrait landscape' },
  { id: 'pdf-images', slug: 'pdf-to-images', name: 'PDF → images', symbol: '▥', short: 'Pages as PNG or JPG', description: 'Export selected PDF pages as images or download them together in a ZIP.', color: 'yellow', category: 'PDFs', keywords: 'pdf image images png jpg jpeg export render convert converter document page photo picture zip' },
  { id: 'text', slug: 'extract-text', name: 'Extract text', symbol: 'T', short: 'Screenshots & scans into words', description: 'Read text from images or scanned PDF pages, edit it and download a TXT file.', color: 'blue', category: 'Documents', keywords: 'ocr text txt extract read recognize recognise recognition screenshot photo image png jpg jpeg webp pdf scan scanned document copy words english german turkish' },
  { id: 'screenshot', slug: 'screenshot-studio', name: 'Screenshot studio', symbol: '▱', short: 'Screenshots worth sharing', description: 'Frame your screenshot with a background, spacing and a caption. Export a polished image.', color: 'purple', category: 'Images', keywords: 'screenshot screen image photo png jpg jpeg webp mockup mock up studio browser window frame border presentation poster thumbnail sharing share design caption gradient background' },
  { id: 'scanner', slug: 'document-scanner', name: 'Document scanner', symbol: '⌑', short: 'A photo into a clean page', description: 'Straighten a photographed page, clean up the paper and save an image or PDF.', color: 'mint', category: 'Documents', keywords: 'document scanner scan scanning photo photograph picture image paper receipt page perspective straighten skew deskew corners clean cleanup png jpg jpeg webp bmp gif pdf' },
  { id: 'heic', slug: 'heic-to-jpg', name: 'HEIC → JPG', symbol: '◩', short: 'iPhone photos, ready to use', description: 'Convert one HEIC or HEIF photo to a shareable JPG on your device.', color: 'pink', category: 'Images', keywords: 'heic heif iphone apple photo jpg jpeg convert conversion' },
  { id: 'compress', slug: 'compress-pdf', name: 'Compress PDF', symbol: '⇲', short: 'Smaller images. Text intact.', description: 'Reduce supported JPEG images inside a PDF while keeping selectable text.', color: 'purple', category: 'PDFs', keywords: 'pdf compress compression shrink smaller reduce size jpeg images' },
  { id: 'split', slug: 'split-pdf', name: 'Split PDF', symbol: '⋮', short: 'Just the pages you need', description: 'Extract page numbers or ranges into a separate PDF, ready for the next task.', color: 'yellow', category: 'PDFs', keywords: 'pdf split extract separate pages range document' },
  { id: 'metadata', slug: 'remove-metadata', name: 'Remove image metadata', symbol: '◈', short: 'Keep the picture. Leave the GPS.', description: 'Remove location, camera tags and comments from JPG or PNG without recompressing pixels.', color: 'mint', category: 'Images', keywords: 'metadata exif gps location privacy camera remove strip jpg jpeg png image photo' },
];

const imagePdf = { id: 'image-pdf', slug: 'image-converter', name: 'Images → PDF', symbol: '▧', short: 'One image or a whole document', description: 'Turn PNG, JPG or WebP images into one PDF, in the order you choose.', color: 'purple', category: 'PDFs', keywords: 'image images photo picture png jpg jpeg webp bmp gif pdf convert converter conversion scan document combine', href: '/tools/image-converter/?format=pdf' };

export const documentTools = [
  { id: 'word-pdf', slug: 'word-to-pdf', name: 'Word → PDF', symbol: 'W', short: 'Preview a DOCX, save a PDF', description: 'Preview a DOCX on your device and export its pages as a flattened PDF. Check layout before sharing.', color: 'blue', category: 'Documents', keywords: 'word docx document pdf convert converter office preview free private' },
  { id: 'powerpoint-pdf', slug: 'powerpoint-to-pdf', name: 'PowerPoint → PDF', symbol: 'P', short: 'Slides ready to share', description: 'Preview a PPTX and export static slides as a flattened PDF. No upload or account.', color: 'pink', category: 'Documents', keywords: 'powerpoint pptx presentation slides deck pdf convert converter office preview free private' },
  { id: 'text-pdf', slug: 'text-to-pdf', name: 'Text → PDF', symbol: '¶', short: 'Notes into a tidy document', description: 'Paste text or open a TXT file, choose a page size and download a PDF with selectable text.', color: 'mint', category: 'Documents', keywords: 'text txt notes plain unicode pdf convert converter create document write paste' },
  { id: 'pdf-text', slug: 'pdf-to-text', name: 'PDF → text', symbol: '≡', short: 'Copy the text that’s already there', description: 'Extract selectable text from a PDF into an editable TXT file. For scans, use Extract text instead.', color: 'yellow', category: 'Documents', keywords: 'pdf text txt extract copy selectable document read convert converter' },
  { id: 'data', slug: 'csv-json', name: 'CSV ↔ JSON', symbol: '{}', short: 'Small data, less fiddling', description: 'Convert CSV rows to JSON objects or a JSON object array to CSV. Everything stays in this tab.', color: 'purple', category: 'Documents', keywords: 'csv json convert converter table data rows spreadsheet format' },
];
export const allToolPages = [...toolPages, ...advancedTools, ...documentTools];
export const toolCatalog = [imagePdf, advancedTools[0], toolPages[4], toolPages[0], advancedTools[1], advancedTools[2], advancedTools[3], toolPages[3], toolPages[1], toolPages[2], advancedTools[4], advancedTools[5], advancedTools[6], ...advancedTools.slice(7), ...documentTools];
export const toolCategories = ['All tools', 'Images', 'PDFs', 'Video', 'Documents'];
export const featuredTools = [toolPages[1], toolPages[0], toolPages[4], toolPages[2]];

export function normalizeSearch(value) {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/→|⇒|->/g, ' to ').replace(/[^a-z0-9]+/g, ' ').trim();
}

const rasterInputs = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'image', 'images', 'photo', 'photos', 'picture', 'pictures']);
const rasterOutputs = new Set(['png', 'jpg', 'jpeg', 'webp', 'image', 'images', 'photo', 'photos', 'picture', 'pictures']);
const pdfImageOutputs = new Set(['png', 'jpg', 'jpeg', 'image', 'images', 'photo', 'photos', 'picture', 'pictures']);
// Recognize unsupported format names too: "SVG to PNG" must not accidentally
// match the raster-to-SVG tool just because both words appear in its description.
const formatWords = 'png|jpg|jpeg|webp|gif|bmp|images?|photos?|pictures?|pdf|svg|tif|tiff|heic|heif|avif|eps|psd|raw|xlsx|xls|csv|excel|doc|docx|word|pptx|ppt|powerpoint|json|mp4|mov|mkv|webm|avi|mp3|wav|text|txt';
const conversionPattern = new RegExp(`\\b(${formatWords}) (?:to|into) (?:an? )?(${formatWords})\\b`);
const ignoredWords = new Set(['a', 'an', 'the', 'my', 'i', 'want', 'need', 'please', 'to', 'into', 'and', 'or', 'with', 'make', 'this', 'file', 'files', 'any', 'can', 'you', 'it', 'me', 'convert', 'conversion', 'from', 'for']);

function conversionTool(source, target) {
  if (['word', 'docx'].includes(source) && target === 'pdf') return 'word-pdf';
  if (['powerpoint', 'pptx'].includes(source) && target === 'pdf') return 'powerpoint-pdf';
  if (['text', 'txt'].includes(source) && target === 'pdf') return 'text-pdf';
  if (source === 'pdf' && ['text', 'txt'].includes(target)) return 'pdf-text';
  if ((source === 'csv' && target === 'json') || (source === 'json' && target === 'csv')) return 'data';
  if (['heic', 'heif'].includes(source) && ['jpg', 'jpeg'].includes(target)) return 'heic';
  if ((rasterInputs.has(source) || source === 'pdf') && ['text', 'txt'].includes(target)) return 'text';
  if (rasterInputs.has(source)) {
    if (target === 'pdf') return 'image-pdf';
    if (target === 'svg') return 'svg';
    if (rasterOutputs.has(target)) return 'image';
  }
  if (source === 'pdf' && pdfImageOutputs.has(target)) return 'pdf-images';
  if (['xlsx', 'csv', 'excel'].includes(source) && target === 'pdf') return 'spreadsheet';
  return null;
}

export function findTools(query = '', category = 'All tools') {
  const normalized = normalizeSearch(query);
  const conversion = normalized.match(conversionPattern);
  const direction = conversion ? conversionTool(conversion[1], conversion[2]) : null;
  if (conversion && !direction) return [];
  // The direction already identifies its engine. Match any additional task words
  // separately, so valid aliases such as "BMP to SVG" do not need every accepted
  // input format repeated in a card's text.
  const remaining = conversion ? normalized.replace(conversion[0], '') : normalized;
  const terms = remaining.split(' ').filter(term => term && !ignoredWords.has(term));
  return toolCatalog.filter(tool => {
    if (category !== 'All tools' && tool.category !== category) return false;
    if (direction && tool.id !== direction) return false;
    const haystack = normalizeSearch(`${tool.name} ${tool.short} ${tool.description} ${tool.keywords}`);
    return terms.every(term => haystack.includes(term));
  });
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function renderToolCards(tools, compact = false) {
  return tools.map(tool => `<a class="task-card tone-${escapeHtml(tool.color)}" href="${escapeHtml(tool.href || `/tools/${tool.slug}/`)}" data-tool-id="${escapeHtml(tool.id)}"><span class="task-top"><span class="task-icon" aria-hidden="true">${escapeHtml(tool.symbol)}</span><span class="task-category">${escapeHtml(tool.category)}</span></span><h3>${escapeHtml(tool.name)}</h3><p>${escapeHtml(compact ? tool.short : tool.description)}</p><span class="task-open">Open tool <span aria-hidden="true">↗</span></span></a>`).join('\n');
}

export const jobGroups = [
  { title: 'Documents, without the upload', description: 'Turn Word files, slides and notes into PDFs, pull out text or switch between CSV and JSON. Free to use. No account.', ids: ['word-pdf', 'powerpoint-pdf', 'text-pdf', 'pdf-text', 'data'] },
  { title: 'Make a PDF neater', description: 'Shrink image-heavy PDFs, extract pages, put them in order or combine documents.', ids: ['compress', 'split', 'organize', 'merge', 'image-pdf', 'pdf-images'] },
  { title: 'Fix a document photo', description: 'Straighten the page, read its text or share a spreadsheet as a PDF.', ids: ['scanner', 'text', 'spreadsheet'] },
  { title: 'Make an image ready to share', description: 'Convert a batch of photos, frame a screenshot, remove a background, crop or trace.', ids: ['heic', 'screenshot', 'background', 'crop', 'image', 'svg', 'metadata'] },
  { title: 'Shrink a short video', description: 'Turn a large attachment into a smaller MP4 on your device.', ids: ['video'] },
];

export function renderJobGroups() {
  return jobGroups.map(group => `<section class="tool-job-group"><header><h2>${group.title}</h2><p>${group.description}</p></header><div class="task-grid">${renderToolCards(group.ids.map(id => toolCatalog.find(tool => tool.id === id)))}</div></section>`).join('');
}

export function renderToolDirectory({ compact = false, id = 'fileforge-directory' } = {}) {
  const prefix = escapeHtml(id);
  const initialTools = compact ? featuredTools : toolCatalog;
  return `<div class="tool-directory${compact ? ' tool-directory-home' : ''}" data-tool-directory data-compact="${compact}">
  <div class="tool-discovery" hidden>
    <form class="tool-search-form" role="search" aria-label="Find a FileForge tool" novalidate>
      <label for="${prefix}-search">What would you like to do?</label>
      <div class="tool-search-input"><span aria-hidden="true">⌕</span><input type="search" id="${prefix}-search" name="tool" placeholder="Try “PNG to PDF” or “remove background”" autocomplete="off" maxlength="120" aria-describedby="${prefix}-hint" aria-controls="${prefix}-results"><button class="tool-search-clear" type="button" aria-label="Clear tool search" hidden>×</button></div>
      <p id="${prefix}-hint" class="tool-search-hint">Search by task or file type. Everything runs in your browser.</p>
    </form>
    <div class="tool-category-filters" role="group" aria-label="Filter tools by category">${toolCategories.map((category, index) => `<button type="button" data-tool-category="${escapeHtml(category)}" aria-pressed="${index === 0}">${escapeHtml(category)}</button>`).join('')}</div>
    <p class="tool-search-count" role="status" aria-live="polite" aria-atomic="true">${compact ? 'Popular tools to get started' : 'Choose the job you need done'}</p>
  </div>
  <div class="task-grid${compact ? ' compact' : ''}${compact ? '' : ' grouped-results'}" id="${prefix}-results" data-tool-results>${compact ? renderToolCards(initialTools, compact) : renderJobGroups()}</div>
  <div class="tool-search-empty" hidden><h3>No matching tools yet</h3><p>Try a file type such as PNG, PDF or MP4, or choose another category.</p><button type="button" class="button secondary" data-tool-reset>${compact ? 'Show popular tools' : 'Show all tools'}</button><a href="/contact/">Suggest a tool →</a></div>
</div>`;
}
