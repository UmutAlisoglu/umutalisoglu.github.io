export const KIT_LIMITS = { count: 12, fileBytes: 20_000_000, totalBytes: 80_000_000, pixels: 24_000_000 };
export const KIT_DEFAULTS = { name: 'My product kit', background: 'paper', remove: false, padding: 12, size: 1600 };
export function kitSettings(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  return {
    name: typeof value.name === 'string' ? value.name.trim().slice(0, 60) || KIT_DEFAULTS.name : KIT_DEFAULTS.name,
    background: ['white', 'paper', 'transparent'].includes(value.background) ? value.background : KIT_DEFAULTS.background,
    remove: typeof value.remove === 'boolean' ? value.remove : KIT_DEFAULTS.remove,
    padding: [6, 12, 20].includes(Number(value.padding)) ? Number(value.padding) : KIT_DEFAULTS.padding,
    size: [1000, 1600, 2000].includes(Number(value.size)) ? Number(value.size) : KIT_DEFAULTS.size,
  };
}
export function kitSlug(name) {
  return String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'product';
}
export function validateKitFiles(files) {
  if (!files.length) throw new Error('Choose at least one product photo.');
  if (files.length > KIT_LIMITS.count) throw new Error('Choose up to 12 photos per kit. Your current photos have been kept.');
  for (const file of files) {
    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) throw new Error('Choose JPG, PNG or WebP photos. Your current photos have been kept.');
    if (!file.size || file.size > KIT_LIMITS.fileBytes) throw new Error('Each photo must be non-empty and under 20 MB. Your current photos have been kept.');
  }
  if (files.reduce((total, file) => total + file.size, 0) > KIT_LIMITS.totalBytes) throw new Error('Keep the whole kit under 80 MB of original photos. Your current photos have been kept.');
}
export function fitProduct(bounds, side, padding) {
  const scale = side * (1 - padding * 2 / 100) / Math.max(bounds.width, bounds.height);
  const width = bounds.width * scale, height = bounds.height * scale;
  return { x: (side - width) / 2, y: (side - height) / 2, width, height };
}
