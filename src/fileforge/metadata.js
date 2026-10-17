// Remove descriptive metadata without decoding or recompressing the pixels.
// Only orientation survives EXIF; colour profiles remain for faithful display.
const ascii = (b, a, n) => String.fromCharCode(...b.subarray(a, a + n));
const join = parts => { const b = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { b.set(p, at); at += p.length; } return b; };
function orientation(tiff) {
  try {
    const v = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    const little = ascii(tiff, 0, 2) === 'II';
    if (!little && ascii(tiff, 0, 2) !== 'MM') return 1;
    if (v.getUint16(2, little) !== 42) return 1;
    const at = v.getUint32(4, little), count = v.getUint16(at, little);
    for (let i = 0; i < Math.min(count, 4096); i++) {
      const p = at + 2 + i * 12;
      if (v.getUint16(p, little) === 274 && v.getUint16(p + 2, little) === 3 && v.getUint32(p + 4, little) === 1) {
        const value = v.getUint16(p + 8, little); return value >= 1 && value <= 8 ? value : 1;
      }
    }
  } catch { /* An invalid EXIF directory cannot supply a valid orientation. */ }
  return 1;
}
function minimalExif(value) {
  return new Uint8Array([73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,value,0,0,0,0,0,0,0]);
}
export function jpegOrientation(bytes) {
  if (bytes[0] !== 255 || bytes[1] !== 216) return 1;
  for (let at = 2; at + 4 <= bytes.length;) {
    if (bytes[at++] !== 255) return 1;
    while (bytes[at] === 255) at++;
    const marker = bytes[at++]; if (marker === 218 || marker === 217) return 1;
    const length = (bytes[at] << 8) | bytes[at + 1];
    if (length < 2 || at + length > bytes.length) return 1;
    if (marker === 225 && ascii(bytes, at + 2, 6) === 'Exif\0\0') return orientation(bytes.subarray(at + 8, at + length));
    at += length;
  }
  return 1;
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const b = new Uint8Array(data.length + 12), v = new DataView(b.buffer);
  v.setUint32(0, data.length); b.set([...type].map(c => c.charCodeAt(0)), 4); b.set(data, 8);
  v.setUint32(b.length - 4, crc32(b.subarray(4, b.length - 4))); return b;
}
export function stripMetadata(bytes) {
  if (bytes[0] === 255 && bytes[1] === 216) {
    const parts = [bytes.subarray(0, 2)]; let at = 2;
    while (at < bytes.length) {
      const start = at;
      if (bytes[at++] !== 255) throw new Error('Invalid JPG marker.');
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 217) { parts.push(bytes.subarray(start, at)); return { bytes: join(parts), type: 'image/jpeg', extension: 'jpg' }; }
      if (marker === 1 || (marker >= 208 && marker <= 215)) { parts.push(bytes.subarray(start, at)); continue; }
      if (at + 2 > bytes.length) throw new Error('Truncated JPG.');
      const length = (bytes[at] << 8) | bytes[at + 1], end = at + length;
      if (length < 2 || end > bytes.length) throw new Error('Truncated JPG segment.');
      const payload = bytes.subarray(at + 2, end);
      if (marker === 218) {
        // Preserve entropy-coded pixels, then parse the next real marker too.
        // Progressive JPEGs may have metadata between their scans.
        let next = end;
        while (next < bytes.length) {
          if (bytes[next] !== 255) { next++; continue; }
          let following = next + 1; while (bytes[following] === 255) following++;
          if (bytes[following] === 0 || bytes[following] >= 208 && bytes[following] <= 215) { next = following + 1; continue; }
          break;
        }
        parts.push(bytes.subarray(start, next)); at = next; continue;
      }
      if (marker === 225 && ascii(payload, 0, 6) === 'Exif\0\0') {
        const value = orientation(payload.subarray(6));
        if (value !== 1) { const data = join([new Uint8Array([69,120,105,102,0,0]), minimalExif(value)]); parts.push(new Uint8Array([255,225,0,data.length + 2]), data); }
      } else if (marker === 224 && ascii(payload, 0, 5) === 'JFIF\0' && payload.length >= 14) {
        const jfif = payload.slice(0, 14); jfif[12] = jfif[13] = 0;
        parts.push(new Uint8Array([255,224,0,16]), jfif);
      } else if ((marker === 226 && ascii(payload, 0, 12) === 'ICC_PROFILE\0') || (marker === 238 && ascii(payload, 0, 5) === 'Adobe') || (marker < 224 || marker > 239) && marker !== 254) parts.push(bytes.subarray(start, end));
      at = end;
    }
    throw new Error('Incomplete JPG.');
  }
  if (ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') {
    const parts = [bytes.subarray(0, 8)], v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const safe = new Set(['cHRM','gAMA','iCCP','sRGB','pHYs','tRNS','sBIT','acTL','fcTL','fdAT','cICP','mDCV','cLLI']);
    for (let at = 8; at + 12 <= bytes.length;) {
      const length = v.getUint32(at), end = at + length + 12;
      if (end > bytes.length) throw new Error('Truncated PNG chunk.');
      const type = ascii(bytes, at + 4, 4);
      if (type === 'eXIf') { const value = orientation(bytes.subarray(at + 8, end - 4)); if (value !== 1) parts.push(pngChunk('eXIf', minimalExif(value))); }
      else if (type[0] === type[0].toUpperCase() || safe.has(type)) parts.push(bytes.subarray(at, end));
      if (type === 'IEND') return { bytes: join(parts), type: 'image/png', extension: 'png' };
      at = end;
    }
    throw new Error('Incomplete PNG.');
  }
  throw new Error('Choose a JPG or PNG. Other formats aren’t supported by the metadata cleaner.');
}
