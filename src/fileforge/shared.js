export function formatBytes(bytes) {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function resultName(name, extension) {
  const safe = name.replace(/[\\/<>:"|?*\x00-\x1f]/g, '_').replace(/\.[^.]+$/, '').slice(0, 140);
  return `${safe || 'file'}-fileforge.${extension}`;
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
