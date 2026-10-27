import { compatibleTools } from './workspace-tools.js';
import { escapeHtml } from './tool-catalog.js';

export const quickJobs = [
  { id: 'attachment', title: 'Prepare an attachment', symbol: '↗', short: 'A file ready to send.', description: 'Resize a photo, check a PDF for compression, or shrink a short video.', accepts: 'One image, PDF or short video', steps: ['Choose a file', 'Make it smaller', 'Download'] },
  { id: 'product', title: 'Refine one product photo', symbol: '◐', short: 'Control the cutout and crop.', description: 'Edit the cutout edges, choose a crop and export one image. For batches, use Product Kit Studio.', accepts: 'One JPG, PNG, WebP, GIF or BMP', steps: ['Remove background', 'Choose a crop', 'Export image'] },
  { id: 'document', title: 'Clean up a document', symbol: '⌑', short: 'From a photo to a tidy PDF.', description: 'Set the page corners, straighten the photo and make a one-page PDF.', accepts: 'One JPG, PNG, WebP, GIF or BMP', steps: ['Straighten photo', 'Make a PDF', 'Download'] },
];

const imageTypes = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
const videoTypes = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'];
export function resolveQuickJob(id, files) {
  const definition = quickJobs.find(job => job.id === id);
  if (!definition) return null;
  if (files.length !== 1) throw new Error(`${definition.title}: choose one file at a time.`);
  const extension = files[0].name.split('.').pop().toLowerCase();
  let steps;
  if (id === 'attachment') {
    if (imageTypes.includes(extension)) steps = [{ tool: 'image', preset: 'attachment-image', label: 'Resize & convert', hint: 'Email-ready JPG, up to 1600 px wide. Adjust the settings and check the output size before sending.' }];
    else if (['heic', 'heif'].includes(extension)) steps = [{ tool: 'heic', label: 'Convert HEIC to JPG', hint: 'Convert your iPhone photo, then make it ready to attach.' }, { tool: 'image', preset: 'attachment-image', label: 'Resize & convert', hint: 'Email-ready JPG, up to 1600 px wide. Compare the size before downloading.' }];
    else if (extension === 'pdf') steps = [{ tool: 'compress', label: 'Compress PDF', hint: 'Reduce supported JPEG images while keeping selectable text. Some PDFs are already optimized; check the actual result.' }];
    else if (videoTypes.includes(extension)) steps = [{ tool: 'video', preset: 'attachment-video', label: 'Compress video', hint: 'Start with a 10 MB target at up to 720p. The local video engine loads only when you start compression.' }];
  } else if (imageTypes.includes(extension)) {
    steps = id === 'product' ? [
      { tool: 'background', label: 'Remove background', hint: 'Remove the background, refine the cutout if needed, then export it. The model loads only when you start.' },
      { tool: 'crop', preset: 'product-crop', label: 'Choose a crop', hint: 'Start with a square crop. Move or resize the selection, then prepare the cropped image.' },
      { tool: 'image', preset: 'product-image', label: 'Export image', hint: 'PNG preserves transparency. Export at up to 1600 px wide, or adjust the settings to fit your shop.' },
    ] : [
      { tool: 'scanner', preset: 'document-photo', label: 'Straighten photo', hint: 'Place the four corners around your page. Straighten it, review the preview and prepare a PNG for the next step.' },
      { tool: 'image-pdf', preset: 'document-pdf', label: 'Make a PDF', hint: 'Review the cleaned page and create an A4 PDF. This contains a page image, not searchable text.' },
    ];
  }
  if (!steps || !compatibleTools(files).some(tool => tool.id === steps[0].tool)) {
    throw new Error(`${definition.title}: ${definition.accepts.toLowerCase()}. Images up to 20 MB; PDFs up to 25 MB; videos up to 100 MB. Other types can use the full toolbox.`);
  }
  return { ...definition, steps, index: 0 };
}

export function renderQuickJobs() {
  return `<section class="quick-jobs" data-quick-jobs aria-labelledby="quick-jobs-title"><header><div><p class="eyebrow">QUICK JOBS</p><h2 id="quick-jobs-title">Start with what you need done.</h2></div><p>A few guided steps. Your files stay on your device.</p></header><div class="quick-job-grid">${quickJobs.map(job => `<a class="quick-job-card" data-quick-job="${job.id}" href="/tools/workspace/?job=${job.id}"><span class="quick-job-symbol" aria-hidden="true">${job.symbol}</span><h3>${job.title}</h3><p>${job.description}</p><small>${job.accepts}</small><span class="quick-job-link">Start this job <span aria-hidden="true">→</span></span></a>`).join('')}</div></section>`;
}

export function renderJobSteps(job) {
  return job.steps.map((step, index) => `<li${index === job.index ? ' aria-current="step"' : ''}${index < job.index ? ' class="is-complete"' : ''}><span aria-hidden="true">${index < job.index ? '✓' : index + 1}</span>${escapeHtml(step.label)}</li>`).join('');
}
