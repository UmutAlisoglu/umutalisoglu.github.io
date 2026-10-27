import { toolCatalog } from './tool-catalog.js';

const raster = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
const inputs = {
  'word-pdf': { extensions: ['docx'], count: 1, each: 10e6 },
  'powerpoint-pdf': { extensions: ['pptx'], count: 1, each: 10e6 },
  'text-pdf': { extensions: ['txt'], count: 1, each: 1e6 },
  'pdf-text': { extensions: ['pdf'], count: 1, each: 25e6 },
  data: { extensions: ['csv', 'json'], count: 1, each: 2e6 },
  heic: { extensions: ['heic', 'heif'], count: 1, each: 20e6 },
  compress: { extensions: ['pdf'], count: 1, each: 25e6 },
  split: { extensions: ['pdf'], count: 1, each: 25e6 },
  metadata: { extensions: ['jpg', 'jpeg', 'png'], count: 1, each: 20e6 },
  'image-pdf': { extensions: raster, count: 50, each: 20e6, total: 100e6 },
  image: { extensions: raster, count: 50, each: 20e6, total: 100e6 },
  background: { extensions: raster, count: 1, each: 20e6 },
  svg: { extensions: raster, count: 1, each: 20e6 },
  crop: { extensions: raster, count: 1, each: 20e6 },
  'pdf-images': { extensions: ['pdf'], count: 1, each: 25e6 },
  organize: { extensions: ['pdf'], count: 20, each: 25e6, total: 75e6 },
  merge: { extensions: ['pdf'], count: 20, each: 25e6, total: 75e6 },
  spreadsheet: { extensions: ['xlsx', 'csv'], count: 1, each: 10e6 },
  video: { extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'], count: 1, each: 100e6 },
  text: { extensions: [...raster, 'pdf'], count: 1, each: 20e6 },
  screenshot: { extensions: ['jpg', 'jpeg', 'png', 'webp'], count: 1, each: 20e6 },
  scanner: { extensions: raster, count: 1, each: 20e6 },
};

// Standalone batch studios have their own selection lifecycle, not the iframe bridge.
export const workspaceTools = toolCatalog.filter(tool => inputs[tool.id]).map(tool => ({ ...tool, ...inputs[tool.id], url: tool.href || `/tools/${tool.slug}/` }));
export function compatibleTools(files) {
  if (!files.length) return workspaceTools;
  return workspaceTools.filter(tool => files.length <= tool.count && files.every(file => {
    const limit = tool.id === 'text' && file.name.toLowerCase().endsWith('.pdf') ? 25e6 : tool.each;
    return file.size > 0 && file.size <= limit && tool.extensions.includes(file.name.split('.').pop().toLowerCase());
  }) && (!tool.total || files.reduce((sum, file) => sum + file.size, 0) <= tool.total));
}

export function validateWorkspaceFiles(files) {
  if (!files.length) throw new Error('Choose a file to start.');
  if (files.length > 50 || files.reduce((sum, file) => sum + file.size, 0) > 100e6) throw new Error('Choose up to 50 files and 100 MB total. The Windows app handles larger jobs.');
  if (files.some(file => !file.size)) throw new Error('One of these files is empty. Choose a file with content.');
  if (!compatibleTools(files).length) throw new Error('This selection does not match a browser tool yet. Try DOCX, PPTX, TXT, JSON, CSV, XLSX, PDF, HEIC, JPG, PNG, WebP or a short video. Mixed file types may need separate tasks.');
  return files;
}
