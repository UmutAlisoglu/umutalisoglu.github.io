export const screenshotPresets = Object.freeze({ landscape: [1600, 1000], square: [1080, 1080], widescreen: [1920, 1080] });
export const screenshotBackgrounds = Object.freeze({
  aurora: ['#36305e', '#7862cc', '#8cc8dc'],
  sunset: ['#ffd8ba', '#eea9b8', '#b8b3ec'],
  midnight: ['#101b34', '#25375f', '#674a92'],
});

function rounded(context, x, y, width, height, radius) {
  context.beginPath(); context.roundRect(x, y, width, height, Math.max(0, Math.min(radius, width / 2, height / 2)));
}
function finite(value, minimum, maximum, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback; }
function readableColor(hex) {
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  const luminance = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  return (luminance + .05) / .05 > 1.05 / (luminance + .05) ? '#202136' : '#ffffff';
}
function captionLines(context, caption, maximumWidth) {
  const words = caption.trim().replace(/\s+/g, ' ').split(' '), lines = []; let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maximumWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  const visible = lines.slice(0, 2);
  for (let index = 0; index < visible.length; index++) {
    let text = visible[index], shortened = index === 1 && lines.length > 2;
    while (text.length && context.measureText(text + (shortened ? '…' : '')).width > maximumWidth) { text = text.slice(0, -1); shortened = true; }
    visible[index] = text + (shortened ? '…' : '');
  }
  return visible;
}

// Preview and download use the same painter and full-size layout coordinates.
// previewMaximum changes only the number of preview pixels, never the composition.
export function renderScreenshot(canvas, source, raw = {}, previewMaximum = null) {
  const [width, height] = screenshotPresets[raw.preset] || screenshotPresets.landscape;
  if (!source?.width || !source?.height || source.width * source.height > 20_000_000 || width * height > 4_000_000) throw new Error('Choose an image up to 20 megapixels.');
  const scale = previewMaximum ? Math.min(1, previewMaximum / Math.max(width, height)) : 1;
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d'); if (!context) throw new Error('Your browser could not create a canvas.');
  context.scale(canvas.width / width, canvas.height / height);
  const palette = screenshotBackgrounds[raw.background] || null, color = /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : '#eeeafa';
  if (palette) {
    const gradient = context.createLinearGradient(0, 0, width, height); palette.forEach((entry, index) => gradient.addColorStop(index / (palette.length - 1), entry)); context.fillStyle = gradient;
  } else context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  if (palette) {
    const glow = context.createRadialGradient(width * .92, height * .9, 0, width * .92, height * .9, width * .8); glow.addColorStop(0, '#ffffff20'); glow.addColorStop(1, '#ffffff00'); context.fillStyle = glow; context.fillRect(0, 0, width, height);
  }
  const padding = finite(raw.padding, 36, 200, 96), radius = finite(raw.roundness, 0, 56, 22), shadow = finite(raw.shadow, 0, 100, 45);
  const angle = finite(raw.tilt, -6, 6, -2) * Math.PI / 180;
  const caption = String(raw.caption || '').slice(0, 120).trim(), fontSize = Math.round(Math.min(width, height) * .047);
  context.font = `650 ${fontSize}px "Segoe UI", Arial, sans-serif`; context.textBaseline = 'top'; context.textAlign = 'center';
  const lines = caption ? captionLines(context, caption, width - padding * 2) : [];
  const captionHeight = lines.length ? lines.length * fontSize * 1.22 + fontSize * .6 : 0;
  context.fillStyle = raw.textColor === 'light' ? '#ffffff' : raw.textColor === 'dark' ? '#202136' : palette ? raw.background === 'sunset' ? '#352842' : '#ffffff' : readableColor(color);
  lines.forEach((line, index) => context.fillText(line, width / 2, padding * .72 + index * fontSize * 1.22));

  const availableWidth = width - padding * 2, availableHeight = height - padding * 2 - captionHeight;
  const border = raw.frame === 'minimal' ? 8 : 2, toolbar = raw.frame === 'minimal' ? 0 : 44;
  const ratio = source.width / source.height, cosine = Math.abs(Math.cos(angle)), sine = Math.abs(Math.sin(angle));
  const imageWidth = Math.min((availableWidth - border * 2 * cosine - (toolbar + border * 2) * sine) / (cosine + sine / ratio), (availableHeight - (toolbar + border * 2) * cosine - border * 2 * sine) / (cosine / ratio + sine));
  const imageHeight = imageWidth / ratio, frameWidth = imageWidth + border * 2, frameHeight = imageHeight + toolbar + border * 2;
  const centerX = width / 2, centerY = padding + captionHeight + availableHeight / 2;
  context.save(); context.translate(centerX, centerY); context.rotate(angle);
  const left = -frameWidth / 2, top = -frameHeight / 2;
  context.shadowColor = `rgba(14, 12, 35, ${shadow / 100 * .42})`; context.shadowBlur = shadow * .7; context.shadowOffsetY = shadow * .22;
  rounded(context, left, top, frameWidth, frameHeight, radius); context.fillStyle = '#ffffff'; context.fill();
  context.shadowColor = 'transparent'; context.shadowBlur = 0; context.shadowOffsetY = 0;
  rounded(context, left, top, frameWidth, frameHeight, radius); context.clip();
  if (toolbar) {
    context.fillStyle = '#f6f5fa'; context.fillRect(left, top, frameWidth, toolbar + border);
    if (frameWidth > 100) ['#f49a9e', '#edcb83', '#88c7b1'].forEach((fill, index) => { context.beginPath(); context.arc(left + 22 + index * 18, top + 23, 5.5, 0, Math.PI * 2); context.fillStyle = fill; context.fill(); });
    if (frameWidth > 320) { context.fillStyle = '#8b859b'; context.font = '500 13px "Segoe UI", Arial, sans-serif'; context.textBaseline = 'middle'; context.textAlign = 'center'; context.fillText('Your project', 0, top + 23); }
    context.fillStyle = '#e3dfed'; context.fillRect(left, top + toolbar, frameWidth, 1);
  }
  rounded(context, left + border, top + border + toolbar, imageWidth, imageHeight, toolbar ? 0 : Math.max(0, radius - border)); context.clip();
  context.fillStyle = '#ffffff'; context.fillRect(left + border, top + border + toolbar, imageWidth, imageHeight);
  context.drawImage(source, left + border, top + border + toolbar, imageWidth, imageHeight); context.restore();
  return { width, height, sourceWidth: source.width, sourceHeight: source.height, frame: raw.frame === 'minimal' ? 'Minimal frame' : 'Browser frame' };
}

export async function createScreenshotSample() {
  const canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = 780;
  const context = canvas.getContext('2d'); context.fillStyle = '#f6f7fb'; context.fillRect(0, 0, 1240, 780);
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, 220, 780);
  context.fillStyle = '#6851c8'; rounded(context, 28, 32, 38, 38, 11); context.fill(); context.fillStyle = '#ffffff'; context.font = '700 25px "Segoe UI", sans-serif'; context.fillText('p', 40, 59);
  context.fillStyle = '#29253e'; context.font = '650 20px "Segoe UI", sans-serif'; context.fillText('Project canvas', 80, 58);
  ['Overview', 'Ideas', 'Collections', 'Settings'].forEach((label, index) => { if (!index) { context.fillStyle = '#f0eafb'; rounded(context, 20, 114 + index * 52, 180, 42, 10); context.fill(); } context.fillStyle = index ? '#9892a7' : '#6751bd'; context.font = '500 15px "Segoe UI", sans-serif'; context.fillText(label, 42, 141 + index * 52); });
  context.fillStyle = '#a39baf'; context.font = '12px "Segoe UI", sans-serif'; context.fillText('ORIGINAL DEMO ARTWORK', 29, 741);
  context.fillStyle = '#9b90ae'; context.font = '600 12px "Segoe UI", sans-serif'; context.fillText('YOUR NEXT PROJECT', 274, 71);
  context.fillStyle = '#28233c'; context.font = '650 37px "Segoe UI", sans-serif'; context.fillText('A place for bright ideas.', 274, 121);
  context.fillStyle = '#8a819d'; context.font = '16px "Segoe UI", sans-serif'; context.fillText('Less clutter. More room to make something good.', 276, 156);
  context.fillStyle = '#7155cc'; rounded(context, 1035, 85, 154, 43, 10); context.fill(); context.fillStyle = '#ffffff'; context.font = '600 14px "Segoe UI", sans-serif'; context.fillText('+  New collection', 1055, 112);
  const cards = [['#e9e1fd', '01', 'Make it useful', 'Small tools. Thoughtful details.'], ['#dff1eb', '02', 'Make it yours', 'A little personality goes a long way.'], ['#f9e9d9', '03', 'Put it out there', 'Good ideas deserve to be seen.']];
  cards.forEach(([fill, number, title, description], index) => {
    const x = 274 + index * 308; context.fillStyle = '#ffffff'; rounded(context, x, 204, 286, 244, 15); context.fill();
    context.fillStyle = fill; rounded(context, x + 20, 224, 246, 114, 10); context.fill(); context.fillStyle = '#615071'; context.font = '600 35px "Segoe UI", sans-serif'; context.fillText(number, x + 40, 295);
    context.fillStyle = '#383047'; context.font = '650 19px "Segoe UI", sans-serif'; context.fillText(title, x + 20, 378); context.fillStyle = '#9a90a4'; context.font = '12px "Segoe UI", sans-serif'; context.fillText(description, x + 20, 407);
  });
  context.fillStyle = '#ffffff'; rounded(context, 274, 476, 902, 245, 15); context.fill(); context.fillStyle = '#44394f'; context.font = '650 18px "Segoe UI", sans-serif'; context.fillText('A week of making', 299, 516);
  context.fillStyle = '#a397b0'; context.font = '12px "Segoe UI", sans-serif'; context.fillText('Every little step counts.', 299, 541);
  [70, 105, 85, 140, 122, 158, 178].forEach((bar, index) => { context.fillStyle = index === 6 ? '#7556ce' : '#e9e0f7'; rounded(context, 329 + index * 113, 689 - bar, 49, bar, 7); context.fill(); });
  try { return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The sample could not be created.')), 'image/png')); }
  finally { canvas.width = 1; canvas.height = 1; }
}
