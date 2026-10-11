export function formatBytes(bytes) {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function resultName(name, extension) {
  const safe = name.replace(/[\\/<>:"|?*\x00-\x1f]/g, '_').replace(/\.[^.]+$/, '').slice(0, 140);
  return `${safe || 'file'}-fileforge.${extension}`;
}

// ZIP entries must stay distinct, including on case-insensitive filesystems.
export function batchNames(files, extension) {
  const used = new Set();
  return files.map(file => {
    const base = resultName(file.name, extension);
    let name = base, suffix = 2;
    while (used.has(name.toLowerCase())) name = base.replace(/\.[^.]+$/, `-${suffix++}.${extension}`);
    used.add(name.toLowerCase());
    return name;
  });
}

export function imageSettings(value) {
  if (!value || !['jpg', 'png', 'webp', 'pdf'].includes(value.format)) return null;
  const quality = Number(value.quality), width = Number(value.width);
  if (!Number.isInteger(quality) || quality < 10 || quality > 100 || !Number.isInteger(width) || width < 0 || width > 12000) return null;
  return { format: value.format, quality, width };
}

// Leave space for the MP4 container; audio is part of the total target, too.
export function videoBudget(targetBytes, duration, keepAudio) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not read this video’s duration.');
  const total = Math.floor(targetBytes * 8 * 0.94 / duration);
  const audio = keepAudio ? Math.min(96_000, Math.floor(total * 0.18)) : 0;
  const video = total - audio;
  if (video < 24_000 || (keepAudio && audio < 8_000)) {
    throw new Error('This target is too small for the full video. Choose a larger size or remove audio.');
  }
  return { video, audio };
}

export function columnGroups(columns, maximum = 7) {
  const groups = [];
  for (let start = 0; start < columns; start += maximum) groups.push([start, Math.min(columns, start + maximum)]);
  return groups;
}
