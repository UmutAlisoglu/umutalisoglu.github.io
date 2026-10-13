export function pageSelection(text, total, maximum = 50) {
  const selection = new Set();
  if (!Number.isInteger(total) || total < 1) throw new Error('This PDF has no pages.');
  if (!text.trim()) {
    if (total > maximum) throw new Error(`Choose a range of up to ${maximum} pages, for example 1-10.`);
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  for (const part of text.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('Use page numbers or ranges, for example 1, 3-5.');
    const first = Number(match[1]), last = Number(match[2] || match[1]);
    if (first < 1 || last < first || last > total) throw new Error(`Page ranges must be between 1 and ${total}, in ascending order.`);
    if (last - first + 1 > maximum) throw new Error(`Export up to ${maximum} pages at a time.`);
    for (let page = first; page <= last; page++) selection.add(page);
    if (selection.size > maximum) throw new Error(`Export up to ${maximum} pages at a time.`);
  }
  return [...selection].sort((a, b) => a - b);
}

export function cropBounds(values, width, height) {
  const result = Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Number(values[key])]));
  if (Object.values(result).some(value => !Number.isInteger(value))) throw new Error('Crop coordinates must be whole pixels.');
  if (result.x < 0 || result.y < 0 || result.width < 1 || result.height < 1 || result.x + result.width > width || result.y + result.height > height) throw new Error(`Keep the crop inside the ${width} × ${height} image.`);
  return result;
}

export function scaledSize(width, height, longest) {
  const scale = Math.min(1, longest / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
