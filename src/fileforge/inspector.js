// File inspector core. Pure functions over a Uint8Array, shared by the browser
// worker and the Node tests. Nothing here touches the network or the DOM.
import { inflateSync, unzlibSync } from 'fflate';

export const INSPECT_LIMIT = 100 * 1024 * 1024;

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');
const ascii = (b, o, n) => latin1.decode(b.subarray(o, Math.min(b.length, o + n)));
const u16le = (b, o) => b[o] | (b[o + 1] << 8);
const u16be = (b, o) => (b[o] << 8) | b[o + 1];
const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u32be = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const has = (b, sig, o = 0) => o >= 0 && o + sig.length <= b.length && sig.every((v, i) => v == null || b[o + i] === v);
const bytesOf = text => [...text].map(c => c.charCodeAt(0));
const clip = (text, max = 300) => { const value = String(text).replace(/\0+$/, '').trim(); return value.length > max ? `${value.slice(0, max)}…` : value; };
const printable = text => /^[\x20-\x7e]+$/.test(text);
export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB']; let value = bytes / 1024, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
const duration = seconds => {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s % 60).padStart(2, '0')}`;
};

// ---------------------------------------------------------------- formats
const F = (id, name, mime, extensions, family, description) => ({ id, name, mime, extensions, family, description });
export const formats = {
  png: F('png', 'PNG image', 'image/png', ['png', 'apng'], 'image', 'Lossless raster image.'),
  jpeg: F('jpeg', 'JPEG image', 'image/jpeg', ['jpg', 'jpeg', 'jpe', 'jfif'], 'image', 'Compressed photo format.'),
  gif: F('gif', 'GIF image', 'image/gif', ['gif'], 'image', 'Palette image, possibly animated.'),
  webp: F('webp', 'WebP image', 'image/webp', ['webp'], 'image', 'Modern web image format.'),
  bmp: F('bmp', 'BMP bitmap', 'image/bmp', ['bmp', 'dib'], 'image', 'Uncompressed Windows bitmap.'),
  tiff: F('tiff', 'TIFF image', 'image/tiff', ['tif', 'tiff', 'dng', 'nef', 'cr2', 'arw', 'orf', 'rw2', 'pef'], 'image', 'Tagged image, also used by many camera RAW formats.'),
  ico: F('ico', 'Windows icon', 'image/x-icon', ['ico'], 'image', 'Icon container.'),
  cur: F('cur', 'Windows cursor', 'image/x-icon', ['cur'], 'image', 'Cursor container.'),
  psd: F('psd', 'Photoshop document', 'image/vnd.adobe.photoshop', ['psd', 'psb'], 'image', 'Layered Adobe Photoshop file.'),
  heic: F('heic', 'HEIC/HEIF image', 'image/heic', ['heic', 'heif', 'hif'], 'image', 'High-efficiency image, common on iPhones.'),
  avif: F('avif', 'AVIF image', 'image/avif', ['avif'], 'image', 'AV1-based image format.'),
  cr3: F('cr3', 'Canon CR3 RAW', 'image/x-canon-cr3', ['cr3'], 'image', 'Canon camera RAW photo.'),
  mp4: F('mp4', 'MP4 video', 'video/mp4', ['mp4', 'm4v', 'm4a', 'm4b', 'm4p', 'f4v', 'mov', '3gp'], 'video', 'ISO base media file.'),
  mov: F('mov', 'QuickTime movie', 'video/quicktime', ['mov', 'qt', 'mp4'], 'video', 'Apple QuickTime container.'),
  m4a: F('m4a', 'MPEG-4 audio', 'audio/mp4', ['m4a', 'm4b', 'm4p', 'mp4', 'aac'], 'audio', 'AAC or ALAC audio in an MP4 container.'),
  '3gp': F('3gp', '3GPP video', 'video/3gpp', ['3gp', '3g2', 'mp4'], 'video', 'Mobile video container.'),
  webm: F('webm', 'WebM video', 'video/webm', ['webm', 'weba'], 'video', 'Matroska-based web video.'),
  mkv: F('mkv', 'Matroska video', 'video/x-matroska', ['mkv', 'mka', 'mks', 'mk3d'], 'video', 'Flexible media container.'),
  avi: F('avi', 'AVI video', 'video/x-msvideo', ['avi'], 'video', 'RIFF-based video container.'),
  wav: F('wav', 'WAV audio', 'audio/wav', ['wav', 'wave', 'bwf'], 'audio', 'Uncompressed RIFF audio.'),
  mp3: F('mp3', 'MP3 audio', 'audio/mpeg', ['mp3', 'mp2'], 'audio', 'MPEG audio.'),
  flac: F('flac', 'FLAC audio', 'audio/flac', ['flac'], 'audio', 'Lossless compressed audio.'),
  ogg: F('ogg', 'Ogg media', 'audio/ogg', ['ogg', 'oga', 'ogv', 'opus', 'spx'], 'audio', 'Ogg container (Vorbis, Opus or Theora).'),
  aiff: F('aiff', 'AIFF audio', 'audio/aiff', ['aif', 'aiff', 'aifc'], 'audio', 'Apple uncompressed audio.'),
  midi: F('midi', 'MIDI music', 'audio/midi', ['mid', 'midi'], 'audio', 'Musical note data.'),
  pdf: F('pdf', 'PDF document', 'application/pdf', ['pdf', 'ai'], 'document', 'Portable Document Format.'),
  ps: F('ps', 'PostScript', 'application/postscript', ['ps', 'eps', 'ai'], 'document', 'Page description program.'),
  rtf: F('rtf', 'Rich Text document', 'application/rtf', ['rtf', 'doc'], 'document', 'Rich Text Format.'),
  ole: F('ole', 'Legacy Office / OLE file', 'application/x-ole-storage', ['doc', 'xls', 'ppt', 'msg', 'msi', 'vsd', 'pub', 'dot', 'xlt', 'pps', 'mpp'], 'document', 'Compound file used by older Word, Excel, PowerPoint, Outlook and installers.'),
  docx: F('docx', 'Word document (DOCX)', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['docx', 'docm', 'dotx', 'dotm'], 'document', 'Office Open XML document in a ZIP container.'),
  xlsx: F('xlsx', 'Excel workbook (XLSX)', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['xlsx', 'xlsm', 'xltx', 'xltm', 'xlam'], 'document', 'Office Open XML workbook in a ZIP container.'),
  pptx: F('pptx', 'PowerPoint (PPTX)', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ['pptx', 'pptm', 'potx', 'ppsx', 'ppsm'], 'document', 'Office Open XML presentation in a ZIP container.'),
  odf: F('odf', 'OpenDocument file', 'application/vnd.oasis.opendocument', ['odt', 'ods', 'odp', 'odg', 'odf', 'ott', 'ots', 'otp'], 'document', 'LibreOffice / OpenOffice document in a ZIP container.'),
  epub: F('epub', 'EPUB e-book', 'application/epub+zip', ['epub'], 'document', 'E-book in a ZIP container.'),
  zip: F('zip', 'ZIP archive', 'application/zip', ['zip', 'zipx', 'cbz', 'nupkg', 'whl', 'xpi', 'crx', 'vsix', 'kmz', 'ipa', 'sketch', '3mf', 'usdz'], 'archive', 'Compressed file archive.'),
  jar: F('jar', 'Java archive (JAR)', 'application/java-archive', ['jar', 'war', 'ear'], 'executable', 'Java program packed in a ZIP container.'),
  apk: F('apk', 'Android app (APK)', 'application/vnd.android.package-archive', ['apk', 'aab', 'xapk'], 'executable', 'Android application package.'),
  rar: F('rar', 'RAR archive', 'application/vnd.rar', ['rar', 'cbr'], 'archive', 'RAR compressed archive.'),
  '7z': F('7z', '7-Zip archive', 'application/x-7z-compressed', ['7z'], 'archive', '7-Zip compressed archive.'),
  gzip: F('gzip', 'Gzip archive', 'application/gzip', ['gz', 'tgz', 'gzip', 'svgz'], 'archive', 'Gzip compressed data.'),
  bzip2: F('bzip2', 'Bzip2 archive', 'application/x-bzip2', ['bz2', 'tbz', 'tbz2'], 'archive', 'Bzip2 compressed data.'),
  xz: F('xz', 'XZ archive', 'application/x-xz', ['xz', 'txz'], 'archive', 'XZ / LZMA2 compressed data.'),
  zstd: F('zstd', 'Zstandard archive', 'application/zstd', ['zst', 'tzst'], 'archive', 'Zstandard compressed data.'),
  tar: F('tar', 'TAR archive', 'application/x-tar', ['tar'], 'archive', 'Uncompressed tape archive.'),
  cab: F('cab', 'Windows cabinet', 'application/vnd.ms-cab-compressed', ['cab'], 'archive', 'Microsoft cabinet archive.'),
  deb: F('deb', 'Unix ar / Debian package', 'application/vnd.debian.binary-package', ['deb', 'a', 'ar', 'lib'], 'archive', 'ar archive, used by Debian packages and static libraries.'),
  rpm: F('rpm', 'RPM package', 'application/x-rpm', ['rpm'], 'archive', 'Red Hat package.'),
  iso: F('iso', 'Disc image (ISO)', 'application/x-iso9660-image', ['iso', 'img'], 'archive', 'ISO 9660 disc image.'),
  exe: F('exe', 'Windows program (PE)', 'application/vnd.microsoft.portable-executable', ['exe', 'dll', 'sys', 'scr', 'cpl', 'ocx', 'efi', 'mui', 'com', 'drv'], 'executable', 'Windows executable or library.'),
  elf: F('elf', 'Linux/Unix program (ELF)', 'application/x-elf', ['', 'so', 'o', 'elf', 'bin', 'axf', 'ko', 'out'], 'executable', 'Executable and Linkable Format.'),
  macho: F('macho', 'macOS program (Mach-O)', 'application/x-mach-binary', ['', 'dylib', 'bundle', 'o'], 'executable', 'Apple executable.'),
  class: F('class', 'Java class file', 'application/java-vm', ['class'], 'executable', 'Compiled Java bytecode.'),
  wasm: F('wasm', 'WebAssembly module', 'application/wasm', ['wasm'], 'executable', 'Compiled WebAssembly code.'),
  dex: F('dex', 'Android DEX bytecode', 'application/octet-stream', ['dex'], 'executable', 'Compiled Android bytecode.'),
  lnk: F('lnk', 'Windows shortcut', 'application/x-ms-shortcut', ['lnk'], 'executable', 'Shortcut that can start a program.'),
  sqlite: F('sqlite', 'SQLite database', 'application/vnd.sqlite3', ['sqlite', 'sqlite3', 'db', 'db3', 's3db', 'sl3'], 'data', 'Self-contained SQL database.'),
  bplist: F('bplist', 'Apple binary property list', 'application/x-bplist', ['plist', 'bplist'], 'data', 'Apple settings data.'),
  dicom: F('dicom', 'DICOM medical image', 'application/dicom', ['dcm', 'dicom'], 'image', 'Medical imaging file.'),
  ttf: F('ttf', 'TrueType font', 'font/ttf', ['ttf', 'tte', 'dfont'], 'font', 'Font file.'),
  otf: F('otf', 'OpenType font', 'font/otf', ['otf'], 'font', 'Font file with CFF outlines.'),
  ttc: F('ttc', 'TrueType collection', 'font/collection', ['ttc'], 'font', 'Several fonts in one file.'),
  woff: F('woff', 'WOFF web font', 'font/woff', ['woff'], 'font', 'Compressed web font.'),
  woff2: F('woff2', 'WOFF2 web font', 'font/woff2', ['woff2'], 'font', 'Compressed web font.'),
  svg: F('svg', 'SVG vector image', 'image/svg+xml', ['svg'], 'text', 'XML vector graphic.'),
  html: F('html', 'HTML page', 'text/html', ['html', 'htm', 'xhtml', 'mhtml', 'php', 'asp', 'aspx', 'jsp', 'vue', 'svelte'], 'text', 'Web page markup.'),
  xml: F('xml', 'XML document', 'application/xml', ['xml', 'xsd', 'xsl', 'xslt', 'rss', 'atom', 'plist', 'svg', 'gpx', 'kml', 'xaml', 'csproj', 'config', 'resx', 'drawio'], 'text', 'Structured markup.'),
  json: F('json', 'JSON data', 'application/json', ['json', 'geojson', 'jsonc', 'webmanifest', 'map', 'har', 'ipynb', 'lock'], 'text', 'Structured data.'),
  pem: F('pem', 'PEM certificate or key', 'application/x-pem-file', ['pem', 'crt', 'cer', 'key', 'pub', 'csr', 'p7b', 'asc'], 'text', 'Base64 certificate, key or signature block.'),
  script: F('script', 'Script with interpreter line', 'text/x-script', ['sh', 'bash', 'zsh', 'py', 'pl', 'rb', 'js', 'mjs', 'php', 'command', 'tcl', 'lua', ''], 'text', 'Text program that starts with #!.'),
  text: F('text', 'Plain text', 'text/plain', [], 'text', 'Readable text.'),
  unknown: F('unknown', 'Unknown binary data', 'application/octet-stream', [], 'unknown', 'No known signature was found.'),
};
const textExtensions = new Set('txt text md markdown csv tsv log ini cfg conf toml yaml yml json jsonc xml html htm svg js mjs cjs ts tsx jsx css scss less sass py rb pl php java kt kts swift c h cc cpp hpp cs go rs sh bash zsh bat cmd ps1 psm1 sql r lua vb vbs tex bib srt vtt ass sub rtf env gitignore gitattributes editorconfig dockerfile makefile gradle properties lock po pot nfo diz asc pem crt cer key pub csr ics vcf eml mbox url desktop reg inf manifest plist gpx kml geojson webmanifest map har ipynb rst adoc org dart scala clj ex exs erl hs ml fs elm vue svelte astro twig hbs mustache ejs pug haml jade coffee'.split(' '));
const iso = { heic: 'heic', heix: 'heic', heim: 'heic', heis: 'heic', hevc: 'heic', hevx: 'heic', mif1: 'heic', msf1: 'heic', avif: 'avif', avis: 'avif', 'qt  ': 'mov', 'M4A ': 'm4a', 'M4B ': 'm4a', 'M4P ': 'm4a', 'crx ': 'cr3' };

function isoBrand(b) {
  const major = ascii(b, 8, 4), size = u32be(b, 0), brands = [major];
  for (let o = 16; o + 4 <= Math.min(size, b.length, 256); o += 4) brands.push(ascii(b, o, 4));
  if (brands.includes('avif') || brands.includes('avis')) return 'avif';
  if (iso[major]) return iso[major];
  if (major.startsWith('3g')) return '3gp';
  return brands.some(brand => brand === 'heic' || brand === 'heix') ? 'heic' : 'mp4';
}

export function detectFormat(b) {
  if (!b.length) return { ...formats.unknown, name: 'Empty file', description: 'The file contains no bytes.' };
  if (has(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return formats.png;
  if (has(b, [0xff, 0xd8, 0xff])) return formats.jpeg;
  if (has(b, bytesOf('GIF87a')) || has(b, bytesOf('GIF89a'))) return formats.gif;
  if (has(b, bytesOf('RIFF')) && b.length >= 12) {
    const type = ascii(b, 8, 4);
    if (type === 'WEBP') return formats.webp;
    if (type === 'WAVE') return formats.wav;
    if (type === 'AVI ') return formats.avi;
  }
  if (has(b, bytesOf('FORM')) && /^AIF[FC]$/.test(ascii(b, 8, 4))) return formats.aiff;
  if (has(b, bytesOf('%PDF-'))) return formats.pdf;
  const pdfAt = b.length > 8 ? latin1.decode(b.subarray(0, Math.min(1024, b.length))).indexOf('%PDF-') : -1;
  if (pdfAt > 0) return { ...formats.pdf, offset: pdfAt };
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') return formats[isoBrand(b)];
  if (b.length >= 8 && ['moov', 'mdat', 'wide', 'free', 'skip'].includes(ascii(b, 4, 4)) && u32be(b, 0) >= 8) return formats.mov;
  if (has(b, [0x50, 0x4b, 0x03, 0x04]) || has(b, [0x50, 0x4b, 0x05, 0x06]) || has(b, [0x50, 0x4b, 0x07, 0x08])) return formats.zip; // refined later
  if (has(b, bytesOf('Rar!\x1a\x07'))) return formats.rar;
  if (has(b, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return formats['7z'];
  if (has(b, [0x1f, 0x8b])) return formats.gzip;
  if (has(b, bytesOf('BZh')) && b[3] >= 0x31 && b[3] <= 0x39) return formats.bzip2;
  if (has(b, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) return formats.xz;
  if (has(b, [0x28, 0xb5, 0x2f, 0xfd])) return formats.zstd;
  if (has(b, bytesOf('MSCF'))) return formats.cab;
  if (has(b, bytesOf('!<arch>\n'))) return formats.deb;
  if (has(b, [0xed, 0xab, 0xee, 0xdb])) return formats.rpm;
  if (has(b, bytesOf('ustar'), 257)) return formats.tar;
  if (has(b, bytesOf('CD001'), 0x8001) || has(b, bytesOf('CD001'), 0x8801)) return formats.iso;
  if (has(b, bytesOf('MZ'))) {
    const pe = b.length > 0x40 ? u32le(b, 0x3c) : 0;
    return pe && has(b, bytesOf('PE\0\0'), pe) ? formats.exe : { ...formats.exe, name: 'DOS program (MZ)', description: 'An old DOS executable header without a Windows PE section.' };
  }
  if (has(b, [0x7f, 0x45, 0x4c, 0x46])) return formats.elf;
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe].includes(u32be(b, 0))) return formats.macho;
  if (u32be(b, 0) === 0xcafebabe && b.length >= 8) return u32be(b, 4) < 30 ? { ...formats.macho, name: 'macOS universal program (Mach-O)' } : formats.class;
  if (has(b, [0x00, 0x61, 0x73, 0x6d])) return formats.wasm;
  if (has(b, bytesOf('dex\n'))) return formats.dex;
  if (has(b, [0x4c, 0, 0, 0, 0x01, 0x14, 0x02, 0])) return formats.lnk;
  if (has(b, bytesOf('SQLite format 3\0'))) return formats.sqlite;
  if (has(b, bytesOf('bplist0'))) return formats.bplist;
  if (has(b, bytesOf('DICM'), 128)) return formats.dicom;
  if (has(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return formats.ole;
  if (has(b, bytesOf('{\\rtf'))) return formats.rtf;
  if (has(b, bytesOf('%!PS')) || has(b, [0xc5, 0xd0, 0xd3, 0xc6])) return formats.ps;
  if (has(b, bytesOf('II*\0')) || has(b, bytesOf('MM\0*')) || has(b, bytesOf('IIRO')) || has(b, bytesOf('IIU\0'))) return formats.tiff;
  if (has(b, bytesOf('8BPS'))) return formats.psd;
  if (has(b, bytesOf('BM')) && b.length >= 26 && u32le(b, 14) >= 12 && u32le(b, 14) <= 124) return formats.bmp;
  if (has(b, [0, 0, 1, 0]) && b.length > 22 && u16le(b, 4) > 0 && u16le(b, 4) < 256 && b[9] === 0) return formats.ico;
  if (has(b, [0, 0, 2, 0]) && b.length > 22 && u16le(b, 4) > 0 && u16le(b, 4) < 256) return formats.cur;
  if (has(b, bytesOf('ID3'))) return formats.mp3;
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0 && b.length > 4 && (b[2] & 0xf0) !== 0xf0) return formats.mp3;
  if (has(b, bytesOf('fLaC'))) return formats.flac;
  if (has(b, bytesOf('OggS'))) return formats.ogg;
  if (has(b, bytesOf('MThd'))) return formats.midi;
  if (has(b, [0x1a, 0x45, 0xdf, 0xa3])) return latin1.decode(b.subarray(0, 64)).includes('webm') ? formats.webm : formats.mkv;
  if (has(b, bytesOf('wOFF'))) return formats.woff;
  if (has(b, bytesOf('wOF2'))) return formats.woff2;
  if (has(b, [0, 1, 0, 0, 0]) || has(b, bytesOf('true'))) return formats.ttf;
  if (has(b, bytesOf('OTTO'))) return formats.otf;
  if (has(b, bytesOf('ttcf'))) return formats.ttc;
  return detectText(b);
}

function looksBinary(b) {
  const end = Math.min(b.length, 65536);
  if (has(b, [0xff, 0xfe]) || has(b, [0xfe, 0xff])) return false;
  let control = 0;
  for (let i = 0; i < end; i++) {
    const c = b[i];
    if (c === 0) return true;
    if (c < 9 || (c > 13 && c < 32 && c !== 27)) control++;
  }
  return control > end * 0.02;
}

export function decodeText(b) {
  if (has(b, [0xff, 0xfe])) return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), encoding: 'UTF-16 LE (with BOM)' };
  if (has(b, [0xfe, 0xff])) return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), encoding: 'UTF-16 BE (with BOM)' };
  const bom = has(b, [0xef, 0xbb, 0xbf]);
  try { const text = new TextDecoder('utf-8', { fatal: true }).decode(bom ? b.subarray(3) : b); return { text, encoding: bom ? 'UTF-8 (with BOM)' : (/[^\x00-\x7f]/.test(text) ? 'UTF-8' : 'ASCII') }; }
  catch { return { text: new TextDecoder('windows-1252').decode(b), encoding: 'Windows-1252 / Latin-1 (not valid UTF-8)' }; }
}

function detectText(b) {
  if (looksBinary(b)) return formats.unknown;
  const head = decodeText(b.subarray(0, 4096)).text.replace(/^\uFEFF/, '').trimStart();
  if (head.startsWith('#!')) return formats.script;
  if (/^-----BEGIN [A-Z0-9 ]+-----/.test(head)) return formats.pem;
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return formats.svg;
  if (/^(<!--[\s\S]*?-->\s*)*<!DOCTYPE html|^<html[\s>]/i.test(head)) return formats.html;
  if (/^<\?xml/.test(head)) return /<svg[\s>]/i.test(head) ? formats.svg : formats.xml;
  if (/^[[{]/.test(head) && b.length <= 8_000_000) { try { JSON.parse(decodeText(b).text.replace(/^\uFEFF/, '')); return formats.json; } catch { /* not JSON */ } }
  return formats.text;
}

// ---------------------------------------------------------------- EXIF / TIFF
const tiffTags = {
  0x0100: 'Image width', 0x0101: 'Image height', 0x010e: 'Description', 0x010f: 'Camera make', 0x0110: 'Camera model', 0x0112: 'Orientation',
  0x011a: 'X resolution', 0x011b: 'Y resolution', 0x0131: 'Software', 0x0132: 'Modified', 0x013b: 'Artist', 0x8298: 'Copyright',
  0x9c9b: 'Title (Windows)', 0x9c9c: 'Comment (Windows)', 0x9c9d: 'Author (Windows)', 0x9c9e: 'Keywords (Windows)', 0x9c9f: 'Subject (Windows)',
};
const exifTags = {
  0x829a: 'Exposure', 0x829d: 'Aperture', 0x8827: 'ISO', 0x9003: 'Taken', 0x9004: 'Digitized', 0x9010: 'Time zone', 0x9011: 'Time zone (taken)',
  0x920a: 'Focal length', 0x9209: 'Flash', 0xa002: 'Pixel width', 0xa003: 'Pixel height', 0xa430: 'Camera owner', 0xa431: 'Camera serial number',
  0xa433: 'Lens make', 0xa434: 'Lens model', 0xa435: 'Lens serial number', 0x927c: 'Maker notes', 0x9286: 'User comment', 0xa420: 'Unique image ID', 0xa405: 'Focal length (35 mm)',
};
const gpsTags = { 1: 'lat-ref', 2: 'lat', 3: 'lon-ref', 4: 'lon', 5: 'alt-ref', 6: 'alt', 7: 'time', 0x11: 'direction', 0x1d: 'date' };
const orientations = ['', 'Normal', 'Mirrored', 'Rotated 180°', 'Mirrored, rotated 180°', 'Mirrored, rotated 90°', 'Rotated 90° clockwise', 'Mirrored, rotated 270°', 'Rotated 90° counter-clockwise'];
const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 11: 4, 12: 8 };

export function parseTiff(b, start, end = b.length) {
  if (start + 8 > end) return null;
  const little = b[start] === 0x49 && b[start + 1] === 0x49;
  if (!little && !(b[start] === 0x4d && b[start + 1] === 0x4d)) return null;
  const r16 = o => (little ? u16le : u16be)(b, o), r32 = o => (little ? u32le : u32be)(b, o);
  const seen = new Set();
  const value = (type, count, at) => {
    const size = (typeSize[type] || 1) * count;
    const o = size > 4 ? start + r32(at) : at;
    if (o < start || o + size > end) return undefined;
    if (type === 2) return clip(latin1.decode(b.subarray(o, o + count)), 500);
    if (type === 7 || type === 1) return b.subarray(o, o + size);
    const one = i => {
      const p = o + i * (typeSize[type] || 1);
      if (type === 3) return r16(p);
      if (type === 4) return r32(p);
      if (type === 9) return r32(p) | 0;
      if (type === 5) { const d = r32(p + 4); return d ? r32(p) / d : 0; }
      if (type === 10) { const d = r32(p + 4) | 0; return d ? (r32(p) | 0) / d : 0; }
      return undefined;
    };
    return count === 1 ? one(0) : Array.from({ length: Math.min(count, 64) }, (_, i) => one(i));
  };
  const ifd = offset => {
    const o = start + offset, out = {};
    if (!offset || seen.has(o) || o + 2 > end) return { tags: out, next: 0 };
    seen.add(o);
    const count = r16(o);
    if (count > 1000 || o + 2 + count * 12 > end) return { tags: out, next: 0 };
    for (let i = 0; i < count; i++) {
      const p = o + 2 + i * 12, tag = r16(p), type = r16(p + 2), n = r32(p + 4);
      if (!typeSize[type] || n > 10_000_000) continue;
      out[tag] = { type, count: n, value: value(type, n, p + 8) };
    }
    const next = o + 2 + count * 12 + 4 <= end ? r32(o + 2 + count * 12) : 0;
    return { tags: out, next };
  };
  const first = ifd(r32(start + 4));
  const exif = first.tags[0x8769] ? ifd(first.tags[0x8769].value).tags : {};
  const gps = first.tags[0x8825] ? ifd(first.tags[0x8825].value).tags : {};
  const second = first.next ? ifd(first.next).tags : {};
  let thumbnail = null;
  if (second[0x0201] && second[0x0202]) {
    const offset = start + second[0x0201].value, length = second[0x0202].value;
    if (offset + length <= end && has(b, [0xff, 0xd8], offset)) thumbnail = { offset, length, mime: 'image/jpeg' };
  }
  return { little, ifd0: first.tags, exif, gps, thumbnail };
}

const text16 = bytes => (bytes instanceof Uint8Array ? new TextDecoder('utf-16le').decode(bytes).replace(/\0+$/, '') : String(bytes));
function formatTag(name, tag) {
  const v = tag.value;
  if (v == null) return null;
  if (name.endsWith('(Windows)')) return clip(text16(v));
  if (name === 'Orientation') return orientations[v] || String(v);
  if (name === 'Exposure') return v > 0 && v < 1 ? `1/${Math.round(1 / v)} s` : `${+v.toFixed?.(2) || v} s`;
  if (name === 'Aperture') return `f/${(+v).toFixed(1)}`;
  if (name === 'Focal length') return `${(+v).toFixed(1)} mm`;
  if (name === 'Focal length (35 mm)') return `${v} mm`;
  if (name === 'Flash') return v & 1 ? 'Fired' : 'Did not fire';
  if (name === 'Maker notes') return `${formatSize(tag.count)} of manufacturer data`;
  if (name === 'User comment') { const raw = v instanceof Uint8Array ? latin1.decode(v.subarray(8)) : String(v); const textValue = clip(raw.replace(/\0/g, '')); return textValue || null; }
  if (v instanceof Uint8Array) return null;
  if (Array.isArray(v)) return v.map(x => (Number.isInteger(x) ? x : +x.toFixed(3))).join(', ');
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(+v.toFixed(3));
  return clip(v) || null;
}

export function readGps(gps) {
  const tags = {}; for (const [id, tag] of Object.entries(gps)) if (gpsTags[id]) tags[gpsTags[id]] = tag.value;
  const deg = v => (Array.isArray(v) && v.length >= 3 ? v[0] + v[1] / 60 + v[2] / 3600 : typeof v === 'number' ? v : NaN);
  let lat = deg(tags.lat), lon = deg(tags.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  if (String(tags['lat-ref']).startsWith('S')) lat = -lat;
  if (String(tags['lon-ref']).startsWith('W')) lon = -lon;
  const altitude = typeof tags.alt === 'number' ? (tags['alt-ref'] instanceof Uint8Array && tags['alt-ref'][0] === 1 ? -tags.alt : tags.alt) : null;
  return { lat: +lat.toFixed(6), lon: +lon.toFixed(6), altitude: altitude == null ? null : Math.round(altitude), date: typeof tags.date === 'string' ? tags.date : null };
}

function exifGroup(r, tiff, label = 'EXIF (camera data)') {
  if (!tiff) return;
  const items = [];
  for (const [dictionary, tags] of [[tiffTags, tiff.ifd0], [exifTags, tiff.exif]]) {
    for (const [id, tag] of Object.entries(tags)) {
      const name = dictionary[id];
      if (!name) continue;
      const shown = formatTag(name, tag);
      if (shown) items.push([name, shown]);
    }
  }
  const gps = readGps(tiff.gps);
  if (gps) {
    items.unshift(['GPS location', `${gps.lat}, ${gps.lon}${gps.altitude != null ? ` · ${gps.altitude} m` : ''}`, 'gps']);
    r.gps = gps;
    r.findings.push({ level: 'warn', title: 'GPS location is stored in this file', detail: `Anyone with the file can read where it was made: ${gps.lat}, ${gps.lon}. Remove the metadata before sharing it publicly.`, action: 'metadata' });
  }
  if (tiff.thumbnail) {
    items.push(['Embedded thumbnail', `${formatSize(tiff.thumbnail.length)} JPEG at offset ${tiff.thumbnail.offset}`]);
    r.thumbnail = tiff.thumbnail;
    r.findings.push({ level: 'notice', title: 'A small preview image is embedded', detail: 'Editors do not always update it. If the photo was cropped or retouched, the thumbnail can still show the original. Compare it below.', offset: tiff.thumbnail.offset });
  }
  const personal = items.filter(([name]) => /owner|serial|Artist|Author/.test(name));
  if (personal.length) r.findings.push({ level: 'notice', title: 'Personal or device details in the metadata', detail: personal.map(([name, value]) => `${name}: ${value}`).join(' · ') });
  if (items.length) r.metadata.push({ group: label, items });
}

// ---------------------------------------------------------------- image parsers
function jpegWalk(b, start = 0) {
  const segments = [];
  let o = start + 2, end = 0, sof = null;
  while (o + 2 <= b.length) {
    if (b[o] !== 0xff) break;
    let m = b[o + 1];
    if (m === 0xff) { o++; continue; }
    if (m === 0xd9) { end = o + 2; break; }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }
    if (o + 4 > b.length) break;
    const length = u16be(b, o + 2);
    if (length < 2 || o + 2 + length > b.length) break;
    segments.push({ marker: m, offset: o, data: o + 4, length: length - 2 });
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m) && !sof) sof = { marker: m, height: u16be(b, o + 5), width: u16be(b, o + 7), components: b[o + 9] };
    o += 2 + length;
    if (m === 0xda) {
      while (o + 1 < b.length) {
        if (b[o] === 0xff && b[o + 1] !== 0 && !(b[o + 1] >= 0xd0 && b[o + 1] <= 0xd7) && b[o + 1] !== 0xff) break;
        o++;
      }
    }
  }
  return { segments, end, sof };
}

function parseJpeg(b, r) {
  const { segments, end, sof } = jpegWalk(b);
  if (sof) {
    r.facts.push(['Dimensions', `${sof.width} × ${sof.height} px`]);
    r.facts.push(['Encoding', `${[0xc2, 0xc6, 0xca, 0xce].includes(sof.marker) ? 'Progressive' : 'Baseline'} · ${sof.components === 1 ? 'greyscale' : sof.components === 4 ? 'CMYK' : 'colour'}`]);
  }
  const comments = [];
  for (const s of segments) {
    const head = ascii(b, s.data, 40);
    if (s.marker === 0xe1 && head.startsWith('Exif\0')) exifGroup(r, parseTiff(b, s.data + 6, s.data + s.length));
    else if (s.marker === 0xe1 && head.startsWith('http://ns.adobe.com/xap/1.0/')) xmpGroup(r, utf8.decode(b.subarray(s.data + 29, s.data + s.length)));
    else if (s.marker === 0xe0 && head.startsWith('JFIF')) r.facts.push(['JFIF', `Version ${b[s.data + 5]}.${String(b[s.data + 6]).padStart(2, '0')}`]);
    else if (s.marker === 0xe2 && head.startsWith('ICC_PROFILE')) r.facts.push(['Colour profile', iccName(b, s.data + 14, s.data + s.length) || 'Embedded ICC profile']);
    else if (s.marker === 0xe2 && head.startsWith('MPF')) r.facts.push(['Multi-picture', 'Contains additional images (MPF), e.g. depth or HDR data']);
    else if (s.marker === 0xed && head.startsWith('Photoshop 3.0')) r.facts.push(['IPTC / Photoshop', `${formatSize(s.length)} of editing metadata`]);
    else if (s.marker === 0xeb && latin1.decode(b.subarray(s.data, s.data + Math.min(s.length, 200))).includes('c2pa')) contentCredentials(r);
    else if (s.marker === 0xfe) comments.push(clip(utf8.decode(b.subarray(s.data, s.data + s.length))));
  }
  if (comments.length) {
    r.metadata.push({ group: 'Comments', items: comments.map((c, i) => [`Comment ${i + 1}`, c]) });
    r.findings.push({ level: 'notice', title: 'Text comment inside the image', detail: comments.join(' · ').slice(0, 300) });
  }
  if (end) trailing(r, b, end, 'end of the JPEG image');
  else r.findings.push({ level: 'notice', title: 'The JPEG has no end marker', detail: 'The file may be truncated or damaged.' });
}

function iccName(b, start, end) {
  if (end - start < 132) return null;
  const count = u32be(b, start + 128);
  for (let i = 0; i < Math.min(count, 60); i++) {
    const p = start + 132 + i * 12;
    if (p + 12 > end || ascii(b, p, 4) !== 'desc') continue;
    const o = start + u32be(b, p + 4);
    if (ascii(b, o, 4) === 'desc') return clip(latin1.decode(b.subarray(o + 12, Math.min(end, o + 12 + u32be(b, o + 8)))), 80);
    if (ascii(b, o, 4) === 'mluc') { const len = u32be(b, o + 20), off = u32be(b, o + 24); return clip(new TextDecoder('utf-16be').decode(b.subarray(o + off, Math.min(end, o + off + len))), 80); }
  }
  return null;
}

function contentCredentials(r) {
  if (r.c2pa) return;
  r.c2pa = true;
  r.findings.push({ level: 'info', title: 'Content Credentials (C2PA) present', detail: 'The file carries a signed record of how it was made or edited, for example by a camera, an editor or an AI image generator.' });
}

function xmpGroup(r, xml) {
  const items = [];
  const pick = (label, pattern) => { const m = xml.match(pattern); if (m && (m[1] ?? m[2]) != null) { const value = clip(decodeXml((m[1] ?? m[2]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))); if (value) items.push([label, value]); } };
  pick('Creator tool', /CreatorTool(?:="([^"]*)"|>([^<]*)<)/);
  for (const [label, key] of [['Creator', 'dc:creator'], ['Title', 'dc:title'], ['Description', 'dc:description'], ['Rights', 'dc:rights'], ['Subject', 'dc:subject']]) pick(label, new RegExp(`<${key}>([\\s\\S]*?)</${key}>`));
  for (const [label, key] of [['Created', 'xmp:CreateDate'], ['Modified', 'xmp:ModifyDate'], ['Metadata date', 'xmp:MetadataDate'], ['Producer', 'pdf:Producer'], ['Document ID', 'xmpMM:DocumentID'], ['Original document ID', 'xmpMM:OriginalDocumentID'], ['Rating', 'xmp:Rating'], ['Label', 'xmp:Label']]) pick(label, new RegExp(`${key}(?:="([^"]*)"|>([^<]*)<)`));
  const history = (xml.match(/stEvt:action="[^"]+"/g) || []).length + (xml.match(/<stEvt:action>/g) || []).length;
  if (history) items.push(['Edit history', `${history} recorded editing step${history === 1 ? '' : 's'}`]);
  if (/DigitalSourceType[^>]*trainedAlgorithmicMedia|trainedAlgorithmicMedia/.test(xml)) r.findings.push({ level: 'info', title: 'Marked as AI-generated', detail: 'The XMP metadata says this media was created by a trained algorithm (IPTC digital source type).' });
  if (/GPano:/.test(xml)) items.push(['Panorama', 'Photo sphere / panorama data (GPano)']);
 r.metadata.push({ group: 'XMP metadata', items: items.length ? items : [['XMP packet', `${formatSize(xml.length)} of XML metadata`]] });
  if (history) r.findings.push({ level: 'notice', title: 'Editing history is recorded', detail: `XMP lists ${history} editing step${history === 1 ? '' : 's'}, which can reveal the software and the order of changes.` });
}
const decodeXml = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');

function trailing(r, b, end, what) {
  const extra = b.length - end;
  if (extra <= 0) return;
  let zeros = true;
  for (let i = end; i < b.length && zeros; i++) if (b[i] !== 0 && b[i] !== 0x0a && b[i] !== 0x0d && b[i] !== 0x20) zeros = false;
  if (zeros && extra < 4096) { r.facts.push(['Padding after end', `${formatSize(extra)} of empty bytes`]); return; }
  const inner = detectFormat(b.subarray(end, end + 4096));
  r.trailing = { offset: end, length: extra, format: inner.id === 'unknown' || inner.id === 'text' ? null : inner.name };
  r.findings.push({ level: 'warn', title: 'Hidden data after the end of the file', detail: `${formatSize(extra)} follow the ${what}. Viewers ignore it, but it is still part of the file${r.trailing.format ? ` and looks like a ${r.trailing.format}` : ''}.`, offset: end, save: { offset: end, length: extra } });
}

function parsePng(b, r) {
  let o = 8, idat = 0, frames = 0, end = 0;
  const texts = [];
  while (o + 12 <= b.length) {
    const length = u32be(b, o), type = ascii(b, o + 4, 4), d = o + 8;
    if (length > b.length - d - 4 || !/^[A-Za-z]{4}$/.test(type)) { r.findings.push({ level: 'notice', title: 'Damaged PNG chunk', detail: `The chunk at offset ${o} is invalid.` }); break; }
    const data = b.subarray(d, d + length);
    if (type === 'IHDR') {
      const colour = ['Greyscale', '', 'RGB', 'Indexed colour', 'Greyscale + alpha', '', 'RGBA'][data[9]] || 'Unknown';
      r.facts.push(['Dimensions', `${u32be(data, 0)} × ${u32be(data, 4)} px`], ['Colour', `${colour} · ${data[8]} bit${data[12] ? ' · interlaced' : ''}`]);
    } else if (type === 'IDAT') idat++;
    else if (type === 'acTL') frames = u32be(data, 0);
    else if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const zero = data.indexOf(0), key = latin1.decode(data.subarray(0, zero));
      let value = '';
      try {
        if (type === 'tEXt') value = latin1.decode(data.subarray(zero + 1));
        else if (type === 'zTXt') value = latin1.decode(unzlibSync(data.subarray(zero + 2)));
        else {
          const compressed = data[zero + 1]; let p = zero + 3;
          p = data.indexOf(0, p) + 1; p = data.indexOf(0, p) + 1;
          value = utf8.decode(compressed ? unzlibSync(data.subarray(p)) : data.subarray(p));
        }
      } catch { value = '(could not decode)'; }
      if (key === 'XML:com.adobe.xmp') xmpGroup(r, value); else texts.push([key, value]);
    } else if (type === 'eXIf') exifGroup(r, parseTiff(b, d + (ascii(b, d, 4) === 'Exif' ? 6 : 0), d + length));
    else if (type === 'iCCP') r.facts.push(['Colour profile', latin1.decode(data.subarray(0, data.indexOf(0)))]);
    else if (type === 'tIME') r.facts.push(['Last modified (tIME)', `${u16be(data, 0)}-${String(data[2]).padStart(2, '0')}-${String(data[3]).padStart(2, '0')} ${String(data[4]).padStart(2, '0')}:${String(data[5]).padStart(2, '0')}`]);
    else if (type === 'caBX') contentCredentials(r);
    o = d + length + 4;
    if (type === 'IEND') { end = o; break; }
  }
  r.facts.push(['Image data', `${idat} IDAT chunk${idat === 1 ? '' : 's'}`]);
  if (frames) r.facts.push(['Animation', `${frames} frames (APNG)`]);
  if (texts.length) {
    r.metadata.push({ group: 'PNG text chunks', items: texts.map(([k, v]) => [k, clip(v, 600)]) });
    const ai = texts.filter(([k]) => /^(parameters|prompt|workflow|Dream|sd-metadata|invokeai_metadata|generation_data|Comment)$/i.test(k) && /steps|seed|sampler|prompt|cfg|model|class_type/i.test(texts.find(([key]) => key === k)[1]));
    if (ai.length) r.findings.push({ level: 'warn', title: 'AI generation settings are embedded', detail: `The ${ai.map(([k]) => `“${k}”`).join(', ')} text chunk contains the prompt and settings used to generate this image. Anyone can read them.` });
    else r.findings.push({ level: 'notice', title: 'Text is stored inside the PNG', detail: texts.map(([k, v]) => `${k}: ${clip(v, 60)}`).join(' · ').slice(0, 300) });
  }
  if (end) trailing(r, b, end, 'PNG end chunk (IEND)');
}

function parseGif(b, r) {
  r.facts.push(['Dimensions', `${u16le(b, 6)} × ${u16le(b, 8)} px`], ['Version', ascii(b, 0, 6)]);
  let o = 13 + (b[10] & 0x80 ? 3 * (2 << (b[10] & 7)) : 0), frames = 0, end = 0;
  const comments = [], apps = [];
  const skipBlocks = p => { while (p < b.length && b[p]) p += b[p] + 1; return p + 1; };
  while (o < b.length) {
    const t = b[o];
    if (t === 0x3b) { end = o + 1; break; }
    if (t === 0x2c) {
      frames++;
      const flags = b[o + 9]; o += 10 + (flags & 0x80 ? 3 * (2 << (flags & 7)) : 0) + 1;
      o = skipBlocks(o);
    } else if (t === 0x21) {
      const label = b[o + 1];
      if (label === 0xfe) { let p = o + 2, text = ''; while (p < b.length && b[p]) { text += latin1.decode(b.subarray(p + 1, p + 1 + b[p])); p += b[p] + 1; } comments.push(clip(text)); o = p + 1; }
      else { if (label === 0xff) apps.push(ascii(b, o + 3, 11)); o = skipBlocks(o + 2); }
    } else break;
  }
  r.facts.push(['Frames', String(frames)]);
  if (apps.length) r.facts.push(['Extensions', [...new Set(apps)].join(', ')]);
  if (comments.length) { r.metadata.push({ group: 'GIF comments', items: comments.map((c, i) => [`Comment ${i + 1}`, c]) }); r.findings.push({ level: 'notice', title: 'Text comment inside the GIF', detail: comments.join(' · ').slice(0, 300) }); }
  if (end) trailing(r, b, end, 'GIF trailer');
}

function riffChunks(b, start, end, visit) {
  let o = start;
  while (o + 8 <= end) {
    const id = ascii(b, o, 4), size = u32le(b, o + 4);
    if (!/^[\x20-\x7e]{4}$/.test(id) || o + 8 + size > end + 1) break;
    visit(id, o + 8, Math.min(size, end - o - 8));
    o += 8 + size + (size & 1);
  }
}

function riffEnd(r, b) {
  const declared = u32le(b, 4) + 8;
  if (declared < b.length) trailing(r, b, declared, 'RIFF data');
  else if (declared > b.length + 1) r.findings.push({ level: 'notice', title: 'The file is shorter than its header says', detail: `It declares ${formatSize(declared)} but has ${formatSize(b.length)}. It may be truncated.` });
}

function parseWebp(b, r) {
  let frames = 0;
  riffChunks(b, 12, Math.min(b.length, u32le(b, 4) + 8), (id, d, size) => {
    if (id === 'VP8 ' && size >= 10) r.facts.push(['Dimensions', `${u16le(b, d + 6) & 0x3fff} × ${u16le(b, d + 8) & 0x3fff} px`], ['Compression', 'Lossy (VP8)']);
    else if (id === 'VP8L' && size >= 5) { const v = u32le(b, d + 1); r.facts.push(['Dimensions', `${(v & 0x3fff) + 1} × ${((v >> 14) & 0x3fff) + 1} px`], ['Compression', 'Lossless (VP8L)']); }
    else if (id === 'VP8X' && size >= 10) r.facts.push(['Canvas', `${(b[d + 4] | (b[d + 5] << 8) | (b[d + 6] << 16)) + 1} × ${(b[d + 7] | (b[d + 8] << 8) | (b[d + 9] << 16)) + 1} px`]);
    else if (id === 'ANMF') frames++;
    else if (id === 'EXIF') exifGroup(r, parseTiff(b, d + (ascii(b, d, 4) === 'Exif' ? 6 : 0), d + size));
    else if (id === 'XMP ') xmpGroup(r, utf8.decode(b.subarray(d, d + size)));
    else if (id === 'ICCP') r.facts.push(['Colour profile', iccName(b, d, d + size) || 'Embedded ICC profile']);
  });
  if (frames) r.facts.push(['Animation', `${frames} frames`]);
  riffEnd(r, b);
}

function parseBmp(b, r) {
  const width = u32le(b, 18) | 0, height = u32le(b, 22) | 0;
  r.facts.push(['Dimensions', `${width} × ${Math.abs(height)} px`], ['Colour depth', `${u16le(b, 28)} bit`]);
  const declared = u32le(b, 2);
  if (declared > 26 && declared < b.length) trailing(r, b, declared, 'bitmap data');
}

function parseTiffFile(b, r) {
  const tiff = parseTiff(b, 0);
  if (!tiff) return;
  const w = tiff.ifd0[0x0100]?.value, h = tiff.ifd0[0x0101]?.value;
  if (w && h) r.facts.push(['Dimensions', `${w} × ${h} px`]);
  if (tiff.ifd0[0x02bc]) { const v = tiff.ifd0[0x02bc].value; if (v instanceof Uint8Array) xmpGroup(r, utf8.decode(v)); }
  exifGroup(r, tiff, 'TIFF / EXIF tags');
}

function parsePsd(b, r) {
  r.facts.push(['Dimensions', `${u32be(b, 18)} × ${u32be(b, 14)} px`], ['Channels', String(u16be(b, 12))], ['Bit depth', `${u16be(b, 22)} bit`]);
  const head = latin1.decode(b.subarray(0, Math.min(b.length, 2_000_000)));
  const xmp = head.indexOf('<x:xmpmeta');
  if (xmp >= 0) xmpGroup(r, head.slice(xmp, head.indexOf('</x:xmpmeta>', xmp) + 12));
}

function exifSearch(b, r, limit = 4_000_000) {
  const head = latin1.decode(b.subarray(0, Math.min(b.length, limit)));
  const at = head.indexOf('Exif\0\0');
  if (at >= 0) exifGroup(r, parseTiff(b, at + 6, Math.min(b.length, at + 6 + 1_000_000)));
  const xmp = head.indexOf('<x:xmpmeta');
  if (xmp >= 0) { const close = head.indexOf('</x:xmpmeta>', xmp); if (close > 0) xmpGroup(r, utf8.decode(b.subarray(xmp, close + 12))); }
}

// ---------------------------------------------------------------- ISO BMFF (MP4, MOV, HEIC)
function boxes(b, start, end, visit, depth = 0) {
  let o = start, count = 0;
  while (o + 8 <= end && count++ < 10000) {
    let size = u32be(b, o), header = 8;
    const type = ascii(b, o + 4, 4);
    if (size === 1) { if (o + 16 > end) break; size = u32be(b, o + 8) * 2 ** 32 + u32be(b, o + 12); header = 16; }
    else if (size === 0) size = end - o;
    if (size < header || o + size > end || !/^[\x20-\x7e\xa9]{4}$/.test(type)) return o;
    visit(type, o + header, o + size, depth);
    o += size;
  }
  return o;
}
const mac1904 = seconds => (seconds > 0 ? new Date((seconds - 2082844800) * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : null);

function parseIso(b, r) {
  const top = [], quick = [], keys = [], values = {};
  let handlers = [], dims = null;
  const brand = ascii(b, 8, 4).trim();
  r.facts.push(['Brand', brand]);
  const end = boxes(b, 0, b.length, (type, d, e) => {
    top.push(`${type} (${formatSize(e - d)})`);
    if (type !== 'moov' && type !== 'meta') return;
    const walk = (s, f, depth) => boxes(b, s, f, (t, dd, ee) => {
      if (t === 'mvhd') {
        const v = b[dd], created = v ? u32be(b, dd + 8) * 2 ** 32 + u32be(b, dd + 12) : u32be(b, dd + 4);
        const scale = v ? u32be(b, dd + 20) : u32be(b, dd + 12), length = v ? u32be(b, dd + 24) * 2 ** 32 + u32be(b, dd + 28) : u32be(b, dd + 16);
        const when = mac1904(created); if (when) r.facts.push(['Created', when]);
        const time = scale ? duration(length / scale) : null; if (time) r.facts.push(['Duration', time]);
      } else if (t === 'tkhd') {
        const w = u32be(b, ee - 8) / 65536, h = u32be(b, ee - 4) / 65536; if (w && h && !dims) dims = `${Math.round(w)} × ${Math.round(h)} px`;
      } else if (t === 'hdlr') handlers.push(ascii(b, dd + 8, 4));
      else if (t === 'keys') {
        const n = u32be(b, dd + 4); let p = dd + 8;
        for (let i = 0; i < n && p + 8 <= ee; i++) { const s = u32be(b, p); keys.push(ascii(b, p + 8, s - 8)); p += s; }
      } else if (t === 'ilst') {
        boxes(b, dd, ee, (item, id, ie) => {
          boxes(b, id, ie, (dt, ddd, dde) => { if (dt === 'data' && u32be(b, ddd) === 1) values[item] = clip(utf8.decode(b.subarray(ddd + 8, dde)), 200); });
        });
      } else if (t.charCodeAt(0) === 0xa9 && depth >= 1 && ee - dd > 4) {
        const len = u16be(b, dd), raw = len && len <= ee - dd - 4 ? b.subarray(dd + 4, dd + 4 + len) : b.subarray(dd, ee);
        const textValue = clip(utf8.decode(raw).replace(/^[\0-\x08]+/, ''), 200);
        if (textValue && printable(textValue.replace(/[^\x00-\x7f]/g, 'x'))) quick.push([t.slice(1), textValue]);
      }
      if (['trak', 'mdia', 'udta', 'minf', 'stbl'].includes(t)) walk(dd, ee, depth + 1);
      if (t === 'meta') walk(dd + (ascii(b, dd + 4, 4) === 'hdlr' ? 0 : 4), ee, depth + 1);
    });
    walk(d, e, 0);
  });
  if (dims) r.facts.push(['Dimensions', dims]);
  if (handlers.length) r.facts.push(['Tracks', handlers.filter(h => /^[a-z]{4}$/.test(h)).map(h => ({ vide: 'video', soun: 'audio', text: 'text', subt: 'subtitles', meta: 'metadata', pict: 'image', mdta: 'metadata' }[h] || h)).join(', ')]);
  r.facts.push(['Top-level boxes', top.slice(0, 12).join(' · ') + (top.length > 12 ? ' …' : '')]);
  const names = { xyz: 'Location', day: 'Date', too: 'Encoder', nam: 'Title', ART: 'Artist', alb: 'Album', cmt: 'Comment', mak: 'Make', mod: 'Model', swr: 'Software', des: 'Description', gen: 'Genre', wrt: 'Composer' };
  const items = quick.map(([k, v]) => [names[k] || k, v]);
  keys.forEach((key, i) => { const v = values[String.fromCharCode(0, 0, 0, i + 1)] ?? values[i + 1]; if (v) items.push([key.replace(/^com\.apple\.quicktime\./, ''), v]); });
  for (const [key, v] of Object.entries(values)) if (key.charCodeAt(0) === 0xa9) items.push([names[key.slice(1)] || key.slice(1), v]);
  const location = items.find(([k]) => /location|Location/.test(k))?.[1];
  const m = location && location.match(/([+-]\d{1,2}(?:\.\d+)?)([+-]\d{1,3}(?:\.\d+)?)/);
  if (m) {
    r.gps = { lat: +m[1], lon: +m[2] };
    r.findings.push({ level: 'warn', title: 'GPS location is stored in this file', detail: `The recording location ${m[1]}, ${m[2]} is saved in the metadata.` });
  }
  if (items.length) r.metadata.push({ group: 'Media metadata', items: dedupe(items) });
  if (r.format.family === 'image') exifSearch(b, r);
  if (end < b.length) trailing(r, b, end, 'last MP4 box');
}
const dedupe = items => items.filter(([k, v], i) => items.findIndex(([a, c]) => a === k && c === v) === i);

// ---------------------------------------------------------------- audio
function id3Text(frame) {
  const enc = frame[0], body = frame.subarray(1);
  const decoded = enc === 1 ? new TextDecoder(body[0] === 0xfe ? 'utf-16be' : 'utf-16le').decode(body.subarray(2)) : enc === 2 ? new TextDecoder('utf-16be').decode(body) : enc === 3 ? utf8.decode(body) : latin1.decode(body);
  return decoded.replace(/\0+/g, ' ').trim();
}
function parseMp3(b, r) {
  const items = [];
  let o = 0;
  if (has(b, bytesOf('ID3'))) {
    const v = b[3], size = (b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9];
    r.facts.push(['ID3 tag', `Version 2.${v} · ${formatSize(size)}`]);
    let p = 10 + (b[5] & 0x40 && v >= 3 ? (v === 4 ? ((b[10] << 21) | (b[11] << 14) | (b[12] << 7) | b[13]) : u32be(b, 10) + 4) : 0);
    const names = { TIT2: 'Title', TPE1: 'Artist', TALB: 'Album', TYER: 'Year', TDRC: 'Recorded', TCON: 'Genre', TRCK: 'Track', TCOM: 'Composer', TENC: 'Encoded by', TSSE: 'Encoder', TPE2: 'Album artist', TCOP: 'Copyright', TPUB: 'Publisher', TXXX: 'Custom text', WXXX: 'Link', COMM: 'Comment', USLT: 'Lyrics' };
    let pictures = 0, privates = 0;
    while (v >= 3 && p + 10 <= Math.min(b.length, size + 10)) {
      const id = ascii(b, p, 4), fs = v === 4 ? (b[p + 4] << 21) | (b[p + 5] << 14) | (b[p + 6] << 7) | b[p + 7] : u32be(b, p + 4);
      if (!/^[A-Z0-9]{4}$/.test(id) || fs <= 0 || p + 10 + fs > b.length) break;
      const frame = b.subarray(p + 10, p + 10 + fs);
      if (id === 'APIC') pictures++;
      else if (id === 'PRIV') privates++;
      else if (id === 'COMM' || id === 'USLT') items.push([names[id], clip(id3Text(Uint8Array.of(frame[0], ...frame.subarray(4, 4000))))]);
      else if (names[id]) items.push([names[id], clip(id3Text(frame.subarray(0, 4000)))]);
      p += 10 + fs;
    }
    if (pictures) r.facts.push(['Cover art', `${pictures} embedded picture${pictures === 1 ? '' : 's'}`]);
    if (privates) r.findings.push({ level: 'notice', title: 'Private ID3 frames', detail: `${privates} PRIV frame${privates === 1 ? '' : 's'} hold data only the writing app understands, sometimes purchase or user IDs.` });
    o = size + 10;
  }
  while (o + 4 < b.length && !(b[o] === 0xff && (b[o + 1] & 0xe0) === 0xe0)) o++;
  if (o + 4 < b.length) {
    const versionBits = (b[o + 1] >> 3) & 3, layer = 4 - ((b[o + 1] >> 1) & 3), bitIndex = b[o + 2] >> 4, rateIndex = (b[o + 2] >> 2) & 3;
    const rates = versionBits === 3 ? [44100, 48000, 32000] : versionBits === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000];
    const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    if (layer === 3 && rates[rateIndex]) {
      r.facts.push(['Audio', `MPEG Layer III · ${rates[rateIndex]} Hz${versionBits === 3 && bitrates[bitIndex] ? ` · ${bitrates[bitIndex]} kbit/s` : ''}`]);
      if (versionBits === 3 && bitrates[bitIndex] && !latin1.decode(b.subarray(o, o + 200)).includes('Xing')) { const t = duration(((b.length - o) * 8) / (bitrates[bitIndex] * 1000)); if (t) r.facts.push(['Duration (estimate)', t]); }
    }
  }
  if (b.length > 128 && ascii(b, b.length - 128, 3) === 'TAG') {
    const t = o => clip(latin1.decode(b.subarray(b.length - 128 + o[0], b.length - 128 + o[1])).replace(/\0/g, ''));
    for (const [label, range] of [['Title (ID3v1)', [3, 33]], ['Artist (ID3v1)', [33, 63]], ['Album (ID3v1)', [63, 93]], ['Year (ID3v1)', [93, 97]]]) { const value = t(range); if (value) items.push([label, value]); }
  }
  if (items.length) r.metadata.push({ group: 'Audio tags', items });
}

function vorbisComments(b, o, end) {
  const items = [];
  if (o + 8 > end) return items;
  const vendorLength = u32le(b, o); let p = o + 4 + vendorLength;
  if (p + 4 > end) return items;
  items.push(['Encoder', clip(utf8.decode(b.subarray(o + 4, p)), 120)]);
  const n = u32le(b, p); p += 4;
  for (let i = 0; i < Math.min(n, 200) && p + 4 <= end; i++) {
    const len = u32le(b, p); p += 4; if (p + len > end) break;
    const entry = utf8.decode(b.subarray(p, p + Math.min(len, 4000))); p += len;
    const eq = entry.indexOf('=');
    if (eq > 0) { const key = entry.slice(0, eq).toUpperCase(); items.push([key === 'METADATA_BLOCK_PICTURE' ? 'Cover art' : key[0] + key.slice(1).toLowerCase(), key === 'METADATA_BLOCK_PICTURE' ? 'Embedded picture' : clip(entry.slice(eq + 1))]); }
  }
  return items;
}
function parseFlac(b, r) {
  let o = 4, last = false;
  while (!last && o + 4 <= b.length) {
    last = !!(b[o] & 0x80); const type = b[o] & 0x7f, len = (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3], d = o + 4;
    if (type === 0 && len >= 18) {
      const rate = (b[d + 10] << 12) | (b[d + 11] << 4) | (b[d + 12] >> 4), channels = ((b[d + 12] >> 1) & 7) + 1, bits = (((b[d + 12] & 1) << 4) | (b[d + 13] >> 4)) + 1;
      const samples = (b[d + 13] & 15) * 2 ** 32 + u32be(b, d + 14);
      r.facts.push(['Audio', `${rate} Hz · ${channels} channel${channels > 1 ? 's' : ''} · ${bits} bit`]);
      const t = rate ? duration(samples / rate) : null; if (t) r.facts.push(['Duration', t]);
    } else if (type === 4) { const items = vorbisComments(b, d, d + len); if (items.length) r.metadata.push({ group: 'Vorbis comments', items }); }
    else if (type === 6) r.facts.push(['Cover art', 'Embedded picture']);
    o = d + len;
  }
}
function parseOgg(b, r) {
  const head = latin1.decode(b.subarray(0, Math.min(b.length, 200000)));
  const codec = head.includes('OpusHead') ? 'Opus' : head.includes('\x01vorbis') ? 'Vorbis' : head.includes('theora') ? 'Theora video' : head.includes('Speex') ? 'Speex' : head.includes('FLAC') ? 'FLAC' : 'Unknown codec';
  r.facts.push(['Codec', codec]);
  const tags = head.indexOf('OpusTags'), vorbis = head.indexOf('\x03vorbis');
  const at = tags >= 0 ? tags + 8 : vorbis >= 0 ? vorbis + 7 : -1;
  if (at >= 0) { const items = vorbisComments(b, at, Math.min(b.length, at + 1_000_000)); if (items.length) r.metadata.push({ group: 'Vorbis comments', items }); }
}
function parseWav(b, r) {
  const info = [];
  let rate = 0, bytesPerSecond = 0, dataSize = 0;
  riffChunks(b, 12, Math.min(b.length, u32le(b, 4) + 8), (id, d, size) => {
    if (id === 'fmt ' && size >= 16) {
      const tag = u16le(b, d); rate = u32le(b, d + 4); bytesPerSecond = u32le(b, d + 8);
      r.facts.push(['Audio', `${{ 1: 'PCM', 3: 'Float', 6: 'A-law', 7: 'µ-law', 0x11: 'IMA ADPCM', 0x55: 'MP3', 0xfffe: 'PCM (extensible)' }[tag] || `Format ${tag}`} · ${rate} Hz · ${u16le(b, d + 2)} channel${u16le(b, d + 2) > 1 ? 's' : ''} · ${u16le(b, d + 14)} bit`]);
    } else if (id === 'data') dataSize = size;
    else if (id === 'LIST' && ascii(b, d, 4) === 'INFO') riffChunks(b, d + 4, d + size, (key, dd, s) => {
      const label = { INAM: 'Title', IART: 'Artist', ICMT: 'Comment', ISFT: 'Software', ICRD: 'Created', ICOP: 'Copyright', IGNR: 'Genre', IENG: 'Engineer', IPRD: 'Album', ITRK: 'Track' }[key] || key;
      const value = clip(latin1.decode(b.subarray(dd, dd + s)).replace(/\0/g, '')); if (value) info.push([label, value]);
    });
    else if (id === 'bext' && size >= 346) { const t = (o, n) => clip(latin1.decode(b.subarray(d + o, d + o + n)).replace(/\0/g, '')); for (const [label, value] of [['Description', t(0, 256)], ['Originator', t(256, 32)], ['Origination date', `${t(320, 10)} ${t(330, 8)}`.trim()]]) if (value) info.push([label, value]); }
  });
  const t = bytesPerSecond ? duration(dataSize / bytesPerSecond) : null; if (t) r.facts.push(['Duration', t]);
  if (info.length) r.metadata.push({ group: 'RIFF INFO tags', items: info });
  riffEnd(r, b);
}

// ---------------------------------------------------------------- ZIP and Office
export function zipEntries(b) {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 5 && b[i + 3] === 6) { eocd = i; break; }
  if (eocd < 0) return null;
  let count = u16le(b, eocd + 10), offset = u32le(b, eocd + 16);
  const comment = latin1.decode(b.subarray(eocd + 22, eocd + 22 + u16le(b, eocd + 20)));
  if ((offset === 0xffffffff || count === 0xffff) && eocd >= 20 && u32le(b, eocd - 20) === 0x07064b50) {
    const z = Number(u32le(b, eocd - 12)) + u32le(b, eocd - 8) * 2 ** 32;
    if (u32le(b, z) === 0x06064b50) { count = u32le(b, z + 32); offset = u32le(b, z + 48) + u32le(b, z + 52) * 2 ** 32; }
  }
  const entries = [];
  let p = offset;
  for (let i = 0; i < Math.min(count, 50000) && p + 46 <= b.length && u32le(b, p) === 0x02014b50; i++) {
    const flags = u16le(b, p + 8), nameLength = u16le(b, p + 28), extra = u16le(b, p + 30), commentLength = u16le(b, p + 32);
    const raw = b.subarray(p + 46, p + 46 + nameLength);
    const name = flags & 0x800 ? utf8.decode(raw) : (() => { try { return new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { return new TextDecoder('windows-1252').decode(raw); } })();
    let size = u32le(b, p + 24), compressed = u32le(b, p + 20), local = u32le(b, p + 42);
    if (size === 0xffffffff || compressed === 0xffffffff || local === 0xffffffff) {
      let e = p + 46 + nameLength; const ee = e + extra;
      while (e + 4 <= ee) { const id = u16le(b, e), len = u16le(b, e + 2); if (id === 1) { let q = e + 4; const read = () => { const v = u32le(b, q) + u32le(b, q + 4) * 2 ** 32; q += 8; return v; }; if (size === 0xffffffff) size = read(); if (compressed === 0xffffffff) compressed = read(); if (local === 0xffffffff) local = read(); } e += 4 + len; }
    }
    const time = u16le(b, p + 12), date = u16le(b, p + 14);
    const when = date ? `${((date >> 9) & 127) + 1980}-${String((date >> 5) & 15).padStart(2, '0')}-${String(date & 31).padStart(2, '0')} ${String(time >> 11).padStart(2, '0')}:${String((time >> 5) & 63).padStart(2, '0')}` : '';
    entries.push({ name, size, compressed, method: u16le(b, p + 10), encrypted: !!(flags & 1), directory: name.endsWith('/'), date: when, local, comment: commentLength ? latin1.decode(b.subarray(p + 46 + nameLength + extra, p + 46 + nameLength + extra + commentLength)) : '' });
    p += 46 + nameLength + extra + commentLength;
  }
  return { entries, comment, offset, end: eocd + 22 + u16le(b, eocd + 20) };
}

export function readZipEntry(b, entry, limit = 30_000_000) {
  const o = entry.local;
  if (entry.encrypted || entry.size > limit || u32le(b, o) !== 0x04034b50) return null;
  const start = o + 30 + u16le(b, o + 26) + u16le(b, o + 28);
  const data = b.subarray(start, start + entry.compressed);
  try {
    if (entry.method === 0) return data;
    if (entry.method === 8) return inflateSync(data, { out: new Uint8Array(entry.size) });
  } catch { return null; }
  return null;
}

const executableNames = /\.(exe|dll|scr|com|bat|cmd|ps1|vbs|vbe|js|jse|wsf|wsh|hta|msi|lnk|jar|apk|app|sh|elf|reg|cpl|iso|img|docm|xlsm|pptm)$/i;
function parseZip(b, r) {
  const zip = zipEntries(b);
  if (!zip) { r.findings.push({ level: 'notice', title: 'ZIP directory is missing', detail: 'The archive has no central directory. It may be truncated, or the ZIP data is only part of a larger file.' }); return; }
  const { entries } = zip;
  const names = new Set(entries.map(e => e.name));
  const find = name => entries.find(e => e.name === name);
  let kind = 'zip';
  if (names.has('[Content_Types].xml')) kind = entries.some(e => e.name.startsWith('word/')) ? 'docx' : entries.some(e => e.name.startsWith('xl/')) ? 'xlsx' : entries.some(e => e.name.startsWith('ppt/')) ? 'pptx' : 'zip';
  const mimetype = find('mimetype') && readZipEntry(b, find('mimetype'));
  const mime = mimetype ? latin1.decode(mimetype).trim() : '';
  if (mime === 'application/epub+zip') kind = 'epub';
  else if (mime.startsWith('application/vnd.oasis.opendocument')) kind = 'odf';
  else if (names.has('AndroidManifest.xml') && [...names].some(n => n.endsWith('.dex'))) kind = 'apk';
  else if (names.has('META-INF/MANIFEST.MF') && [...names].some(n => n.endsWith('.class'))) kind = 'jar';
  if (kind !== 'zip') { r.format = { ...formats[kind], ...(mime && kind === 'odf' ? { mime, name: `OpenDocument ${{ text: 'text', spreadsheet: 'spreadsheet', presentation: 'presentation', graphics: 'drawing' }[mime.split('.').pop()] || 'file'}` } : {}) }; }
  const files = entries.filter(e => !e.directory);
  const total = files.reduce((s, e) => s + e.size, 0), packed = files.reduce((s, e) => s + e.compressed, 0);
  r.facts.push(['Entries', `${files.length} file${files.length === 1 ? '' : 's'}${entries.length > files.length ? `, ${entries.length - files.length} folder${entries.length - files.length === 1 ? '' : 's'}` : ''}`], ['Unpacked size', `${formatSize(total)}${packed ? ` · ratio ${(total / Math.max(packed, 1)).toFixed(1)} : 1` : ''}`]);
  if (zip.comment.trim()) { r.metadata.push({ group: 'Archive comment', items: [['Comment', clip(zip.comment)]] }); r.findings.push({ level: 'notice', title: 'The archive has a comment', detail: clip(zip.comment, 200) }); }
  r.entries = entries.slice(0, 2000).map(e => ({ name: e.name, size: e.size, compressed: e.compressed, date: e.date, encrypted: e.encrypted, directory: e.directory, flag: /(^|\/)\.\.(\/|$)|^\/|^[A-Za-z]:/.test(e.name) ? 'path' : executableNames.test(e.name) ? 'program' : e.encrypted ? 'locked' : '' }));
  r.entryTotal = entries.length;
  r.zipLocals = new Set(entries.map(e => e.local));
  const encrypted = files.filter(e => e.encrypted).length;
  if (encrypted) r.findings.push({ level: 'info', title: 'Password-protected entries', detail: `${encrypted} of ${files.length} files are encrypted. Their names are still visible, their contents are not.` });
  const unsafe = entries.filter(e => /(^|\/)\.\.(\/|$)|^\/|^[A-Za-z]:/.test(e.name));
  if (unsafe.length) r.findings.push({ level: 'warn', title: 'Entries try to leave the extraction folder', detail: `${unsafe.slice(0, 3).map(e => e.name).join(', ')} – paths like this can overwrite files elsewhere when unpacked (“Zip Slip”).` });
  const programs = files.filter(e => executableNames.test(e.name) && !/\.(js)$/i.test(e.name));
  if (programs.length && kind === 'zip') r.findings.push({ level: 'warn', title: 'The archive contains programs or scripts', detail: `${programs.slice(0, 5).map(e => e.name).join(', ')}${programs.length > 5 ? ` and ${programs.length - 5} more` : ''}. Only open them if you trust the sender.` });
  const doubled = files.filter(e => /\.(pdf|docx?|xlsx?|jpe?g|png|txt|mp4)\.(exe|scr|com|bat|cmd|js|vbs|lnk|hta)$/i.test(e.name));
  if (doubled.length) r.findings.push({ level: 'warn', title: 'Disguised file names inside', detail: `${doubled.map(e => e.name).slice(0, 3).join(', ')} – a document-looking name with a program extension.` });
  if (total > 1e9 && total / Math.max(packed, 1) > 100) r.findings.push({ level: 'warn', title: 'Extreme compression ratio', detail: `${formatSize(packed)} unpack to ${formatSize(total)}. This is typical of a “zip bomb” that fills the disk.` });
  const nested = files.filter(e => /\.(zip|rar|7z|gz|tar|tgz|iso|cab|jar|apk)$/i.test(e.name));
  if (nested.length && kind === 'zip') r.findings.push({ level: 'info', title: 'Archives inside the archive', detail: nested.slice(0, 5).map(e => e.name).join(', ') });
  if (['docx', 'xlsx', 'pptx'].includes(kind)) parseOoxml(b, r, entries, find);
  if (kind === 'odf') parseOdf(b, r, find);
  if (kind === 'epub') { const opf = entries.find(e => e.name.endsWith('.opf')); const xml = opf && readZipEntry(b, opf, 5e6); if (xml) { const t = utf8.decode(xml); const items = []; for (const [label, key] of [['Title', 'dc:title'], ['Author', 'dc:creator'], ['Publisher', 'dc:publisher'], ['Language', 'dc:language'], ['Date', 'dc:date'], ['Identifier', 'dc:identifier']]) { const m = t.match(new RegExp(`<${key}[^>]*>([^<]*)<`)); if (m && m[1].trim()) items.push([label, clip(decodeXml(m[1]))]); } if (items.length) r.metadata.push({ group: 'E-book details', items }); } }
  if (kind === 'apk' || kind === 'jar') r.findings.push({ level: 'warn', title: 'This is an installable program', detail: kind === 'apk' ? 'APK files install apps on Android. Only install apps from sources you trust.' : 'JAR files run Java code when opened. Only run them if you trust the source.' });
  if (zip.offset > 0 && entries.length && entries[0].local > 0) {
    const firstLocal = Math.min(...entries.map(e => e.local));
    if (firstLocal > 0) { const lead = detectFormat(b.subarray(0, Math.min(firstLocal, 4096))); r.findings.push({ level: 'warn', title: 'Data before the ZIP archive', detail: `The first ${formatSize(firstLocal)} are not part of the archive${lead.id !== 'unknown' ? ` and look like a ${lead.name}` : ''}. This is how self-extracting programs and file “polyglots” are built.`, offset: 0, save: { offset: 0, length: firstLocal } }); }
  }
  if (zip.end < b.length) trailing(r, b, zip.end, 'ZIP directory');
}

const xmlValue = (xml, tag) => { const m = xml.match(new RegExp(`<(?:[\\w]+:)?${tag}(?:\\s[^>]*)?>([^<]*)</(?:[\\w]+:)?${tag}>`)); return m ? clip(decodeXml(m[1])) : ''; };
function parseOoxml(b, r, entries, find) {
  const read = name => { const e = find(name); const data = e && readZipEntry(b, e, 40e6); return data ? utf8.decode(data) : ''; };
  const core = read('docProps/core.xml'), app = read('docProps/app.xml');
  const items = [];
  for (const [label, tag] of [['Title', 'title'], ['Subject', 'subject'], ['Author', 'creator'], ['Last modified by', 'lastModifiedBy'], ['Created', 'created'], ['Modified', 'modified'], ['Last printed', 'lastPrinted'], ['Revision', 'revision'], ['Keywords', 'keywords'], ['Description', 'description'], ['Category', 'category']]) { const v = xmlValue(core, tag); if (v) items.push([label, v]); }
  for (const [label, tag] of [['Application', 'Application'], ['App version', 'AppVersion'], ['Company', 'Company'], ['Manager', 'Manager'], ['Template', 'Template'], ['Editing time', 'TotalTime'], ['Pages', 'Pages'], ['Words', 'Words'], ['Slides', 'Slides'], ['Hidden slides', 'HiddenSlides']]) { let v = xmlValue(app, tag); if (v && tag === 'TotalTime') v = `${v} min`; if (v && !(tag === 'HiddenSlides' && v === '0')) items.push([label, v]); }
  if (items.length) r.metadata.push({ group: 'Document properties', items });
  const people = items.filter(([k]) => ['Author', 'Last modified by', 'Company', 'Manager'].includes(k));
  if (people.length) r.findings.push({ level: 'notice', title: 'Names are saved in the document properties', detail: people.map(([k, v]) => `${k}: ${v}`).join(' · ') });
  const macros = entries.filter(e => /vbaProject\.bin$|vbaData\.xml$/i.test(e.name));
  if (macros.length) r.findings.push({ level: 'warn', title: 'Contains macros (VBA code)', detail: 'Macros can run code on your computer. Do not enable editing or content unless you trust the sender.' });
  const embedded = entries.filter(e => /\/embeddings\/|\/activeX\/|oleObject/i.test(e.name));
  if (embedded.length) r.findings.push({ level: 'notice', title: 'Embedded files or objects', detail: `${embedded.length} embedded item${embedded.length === 1 ? '' : 's'}: ${embedded.slice(0, 4).map(e => e.name.split('/').pop()).join(', ')}. They can contain other documents with their own metadata.` });
  const external = [];
  for (const e of entries.filter(e => e.name.endsWith('.rels')).slice(0, 400)) {
    const xml = read(e.name);
    for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) if (/TargetMode="External"/.test(m[0])) { const target = decodeXml(m[0].match(/Target="([^"]*)"/)?.[1] || ''); const type = m[0].match(/Type="[^"]*\/([^"/]+)"/)?.[1] || ''; if (type !== 'hyperlink') external.push(`${type}: ${target}`); }
  }
  if (external.length) r.findings.push({ level: 'warn', title: 'Loads content from outside the file', detail: `${external.slice(0, 3).map(x => clip(x, 90)).join(' · ')}. External templates or objects are fetched when the document opens, which can reveal that you opened it.` });
  const comments = entries.filter(e => /comments\d*\.xml$|\/comments\/|threadedComments/i.test(e.name));
  if (comments.length) r.findings.push({ level: 'notice', title: 'Comments are stored in the document', detail: 'Reviewer comments and their author names are part of the file, even if they are hidden in the current view.' });
  if (find('word/document.xml')) {
    const doc = read('word/document.xml');
    const ins = (doc.match(/<w:ins\b/g) || []).length, del = (doc.match(/<w:del\b/g) || []).length, hidden = (doc.match(/<w:vanish\/>/g) || []).length;
    if (ins || del) {
      const authors = [...new Set([...doc.matchAll(/<w:(?:ins|del)\b[^>]*w:author="([^"]*)"/g)].map(m => decodeXml(m[1])))];
      r.findings.push({ level: 'warn', title: 'Tracked changes are still in the file', detail: `${ins} insertion${ins === 1 ? '' : 's'} and ${del} deletion${del === 1 ? '' : 's'}${authors.length ? ` by ${authors.slice(0, 4).join(', ')}` : ''}. Deleted text can be read by anyone who opens the review pane.` });
    }
    if (hidden) r.findings.push({ level: 'warn', title: 'Hidden text', detail: `${hidden} text run${hidden === 1 ? ' is' : 's are'} formatted as hidden. They do not show on screen but are still in the file.` });
  }
  if (find('xl/workbook.xml')) {
    const wb = read('xl/workbook.xml');
    const hidden = [...wb.matchAll(/<sheet\b[^>]*state="(hidden|veryHidden)"[^>]*>/g)].map(m => decodeXml(m[0].match(/name="([^"]*)"/)?.[1] || '?'));
    if (hidden.length) r.findings.push({ level: 'warn', title: 'Hidden worksheets', detail: `${hidden.join(', ')}. Hidden sheets keep their data and formulas.` });
    if (entries.some(e => /externalLinks\//.test(e.name))) r.findings.push({ level: 'notice', title: 'Links to other workbooks', detail: 'Formulas reference external files, whose paths can reveal folder or user names.' });
  }
  if (entries.some(e => /ppt\/notesSlides\//.test(e.name))) r.findings.push({ level: 'notice', title: 'Speaker notes are included', detail: 'Notes are not shown during the presentation but are part of the shared file.' });
  if (entries.some(e => /customXml\//.test(e.name))) r.facts.push(['Custom XML', 'Present (often used by document management systems)']);
}

function parseOdf(b, r, find) {
  const meta = find('meta.xml') && readZipEntry(b, find('meta.xml'), 5e6);
  if (!meta) return;
  const xml = utf8.decode(meta), items = [];
  for (const [label, tag] of [['Title', 'title'], ['Author', 'initial-creator'], ['Last modified by', 'creator'], ['Created', 'creation-date'], ['Modified', 'date'], ['Generator', 'generator'], ['Editing cycles', 'editing-cycles'], ['Editing time', 'editing-duration'], ['Subject', 'subject'], ['Description', 'description']]) { const v = xmlValue(xml, tag); if (v) items.push([label, v]); }
  if (items.length) r.metadata.push({ group: 'Document properties', items });
  const people = items.filter(([k]) => ['Author', 'Last modified by'].includes(k));
  if (people.length) r.findings.push({ level: 'notice', title: 'Names are saved in the document properties', detail: people.map(([k, v]) => `${k}: ${v}`).join(' · ') });
  if (find('Basic/script-lc.xml') || find('Scripts/')) r.findings.push({ level: 'warn', title: 'Contains macros', detail: 'Macros can run code. Do not enable them unless you trust the sender.' });
}

// ---------------------------------------------------------------- PDF
function pdfString(text, i) {
  if (text[i] === '(') {
    let depth = 0, out = '';
    for (let p = i; p < text.length && p < i + 20000; p++) {
      const c = text[p];
      if (c === '\\') { const n = text[++p]; const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }; if (map[n]) out += map[n]; else if (/[0-7]/.test(n)) { let oct = n; while (oct.length < 3 && /[0-7]/.test(text[p + 1])) oct += text[++p]; out += String.fromCharCode(parseInt(oct, 8) & 255); } else if (n === '\r' || n === '\n') { if (n === '\r' && text[p + 1] === '\n') p++; } else out += n; continue; }
      if (c === '(') { if (depth++) out += c; continue; }
      if (c === ')') { if (--depth === 0) break; out += c; continue; }
      out += c;
    }
    return decodePdfText(out);
  }
  if (text[i] === '<') { const close = text.indexOf('>', i); const hex = text.slice(i + 1, close).replace(/[^0-9a-f]/gi, ''); let out = ''; for (let p = 0; p < hex.length; p += 2) out += String.fromCharCode(parseInt(hex.slice(p, p + 2).padEnd(2, '0'), 16)); return decodePdfText(out); }
  return '';
}
function decodePdfText(raw) {
  if (raw.charCodeAt(0) === 0xfe && raw.charCodeAt(1) === 0xff) { let out = ''; for (let i = 2; i + 1 < raw.length; i += 2) out += String.fromCharCode((raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1)); return out; }
  if (raw.startsWith('\xef\xbb\xbf')) return utf8.decode(Uint8Array.from(raw.slice(3), c => c.charCodeAt(0)));
  return raw;
}
export function pdfDate(value) {
  const m = String(value).match(/D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+-])?(\d{2})?'?(\d{2})?/);
  if (!m) return value;
  const [, y, mo = '01', d = '01', h, mi, s, zone, zh, zm] = m;
  return `${y}-${mo}-${d}${h ? ` ${h}:${mi || '00'}${s ? `:${s}` : ''}` : ''}${zone ? (zone.toUpperCase() === 'Z' ? ' UTC' : ` ${zone}${zh || '00'}:${zm || '00'}`) : ''}`;
}

function parsePdf(b, r) {
  const raw = latin1.decode(b);
  r.facts.push(['PDF version', raw.slice(5, 8).match(/\d\.\d/)?.[0] || '?']);
  // Object streams hide most dictionaries in compressed data. Inflate them (bounded) so names inside can be checked too.
  const objectStreams = [];
  let inflated = 0, streams = 0;
  for (const m of raw.matchAll(/\/Type\s*\/ObjStm\b/g)) {
    if (streams++ > 800 || inflated > 60e6) break;
    const dictStart = raw.lastIndexOf('obj', m.index), s = raw.indexOf('stream', m.index);
    if (s < 0 || s - m.index > 2000) continue;
    let start = s + 6; if (raw[start] === '\r') start++; if (raw[start] === '\n') start++;
    const e = raw.indexOf('endstream', start); if (e < 0) continue;
    const dict = raw.slice(dictStart, s);
    try {
      const data = /FlateDecode/.test(dict) ? inflateSync(b.subarray(start + 2, e)) : b.subarray(start, e);
      inflated += data.length;
      const text = latin1.decode(data), n = +(dict.match(/\/N\s+(\d+)/)?.[1] || 0), first = +(dict.match(/\/First\s+(\d+)/)?.[1] || 0);
      const nums = text.slice(0, first).trim().split(/\s+/).map(Number);
      const objects = [];
      for (let i = 0; i < n * 2 && i + 1 < nums.length; i += 2) objects.push([nums[i], first + nums[i + 1], nums[i + 3] != null ? first + nums[i + 3] : text.length]);
      objectStreams.push({ text, objects });
    } catch { /* unreadable stream, skip */ }
  }
  const allText = [raw, ...objectStreams.map(s => s.text)];
  const count = pattern => allText.reduce((sum, t) => sum + (t.match(pattern) || []).length, 0);
  const object = number => {
    const direct = [...raw.matchAll(new RegExp(`(?:^|[^0-9])${number}\\s+\\d+\\s+obj\\b`, 'g'))].pop();
    if (direct) { const start = direct.index + direct[0].length; return raw.slice(start, raw.indexOf('endobj', start) >>> 0 || start + 4000); }
    for (const s of objectStreams) { const hit = s.objects.find(([n]) => n === number); if (hit) return s.text.slice(hit[1], hit[2]); }
    return '';
  };
  const infoRef = [...raw.matchAll(/\/Info\s+(\d+)\s+\d+\s+R/g)].pop();
  let infoText = infoRef ? object(+infoRef[1]) : '';
  if (!infoText) { const inline = [...raw.matchAll(/trailer\s*<<([\s\S]*?)>>\s*startxref/g)].pop(); infoText = inline?.[1].match(/\/Info\s*<<([\s\S]*?)>>/)?.[1] || ''; }
  const info = [];
  const encrypted = /\/Encrypt\s/.test(raw);
  if (!encrypted) for (const key of ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate', 'Company', 'SourceModified']) {
    const m = infoText.match(new RegExp(`/${key}\\s*([(<])`));
    if (!m) continue;
    let value = clip(pdfString(infoText, m.index + m[0].length - 1));
    if (/Date|Modified/.test(key)) value = pdfDate(value);
    if (value) info.push([{ CreationDate: 'Created', ModDate: 'Modified', Creator: 'Created with', Producer: 'PDF producer', SourceModified: 'Source modified' }[key] || key, value]);
  }
  if (info.length) r.metadata.push({ group: 'Document information', items: info });
  const xmpAt = raw.indexOf('<x:xmpmeta');
  if (xmpAt >= 0) { const close = raw.indexOf('</x:xmpmeta>', xmpAt); if (close > 0) xmpGroup(r, utf8.decode(b.subarray(xmpAt, close + 12))); }
  const people = info.filter(([k]) => k === 'Author');
  if (people.length) r.findings.push({ level: 'notice', title: 'An author name is saved in the PDF', detail: people.map(([, v]) => v).join(', ') });
  let pages = 0;
  for (const t of allText) for (const m of t.matchAll(/\/Type\s*\/Pages\b[\s\S]{0,400}?\/Count\s+(\d+)|\/Count\s+(\d+)[\s\S]{0,400}?\/Type\s*\/Pages\b/g)) pages = Math.max(pages, +(m[1] || m[2]));
  if (!pages) pages = count(/\/Type\s*\/Page(?![s\w])/g);
  if (pages) r.facts.push(['Pages', String(pages)]);
  const images = count(/\/Subtype\s*\/Image\b/g); if (images) r.facts.push(['Images', String(images)]);
  const fonts = [...new Set(allText.flatMap(t => [...t.matchAll(/\/FontName\s*\/([^\s/<>[\]()]+)/g)].map(m => m[1].replace(/#([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))))))];
  if (fonts.length) r.facts.push(['Fonts', fonts.slice(0, 8).join(', ') + (fonts.length > 8 ? ` +${fonts.length - 8}` : '')]);
  if (/\/Linearized/.test(raw.slice(0, 2048))) r.facts.push(['Fast web view', 'Linearized']);
  if (/\/Encrypt\s/.test(raw)) { r.facts.push(['Encryption', 'Encrypted (password or permissions)']); r.findings.push({ level: 'info', title: 'The PDF is encrypted', detail: 'Some content and metadata could not be read. Permissions may restrict printing or copying.' }); }
  const signatures = count(/\/Type\s*\/Sig\b|\/ByteRange\s*\[/g);
  if (signatures) r.facts.push(['Digital signatures', 'Present']);
  const js = count(/\/JavaScript\b|\/JS\s*[(<\d]/g), open = count(/\/OpenAction\b/g), aa = count(/\/AA\s*<</g), launch = count(/\/Launch\b/g), files = count(/\/EmbeddedFiles?\b|\/Type\s*\/Filespec\b/g), rich = count(/\/RichMedia\b|\/XFA\b/g), uris = count(/\/URI\s*\(/g), forms = count(/\/AcroForm\b/g), submit = count(/\/SubmitForm\b/g);
  if (js) r.findings.push({ level: 'warn', title: 'The PDF contains JavaScript', detail: `${js} JavaScript reference${js === 1 ? '' : 's'}${open ? ', and an action that runs when the document opens' : ''}. Most ordinary PDFs do not need scripts.` });
  else if (open && count(/\/OpenAction\s*<<[^>]*\/S\s*\/(?:JavaScript|Launch|URI|SubmitForm)/g)) r.findings.push({ level: 'warn', title: 'An action runs when the PDF opens', detail: 'The document starts an action automatically, such as opening a link.' });
  if (launch) r.findings.push({ level: 'warn', title: 'The PDF can launch programs', detail: 'A /Launch action asks the viewer to open another file or program.' });
  if (aa && js) r.findings.push({ level: 'notice', title: 'Automatic actions', detail: `${aa} element${aa === 1 ? '' : 's'} trigger actions on events like opening a page.` });
  if (files) r.findings.push({ level: 'notice', title: 'Files are attached inside the PDF', detail: 'The document carries attachments. Open the attachments panel in your PDF viewer to see them.' });
  if (rich) r.findings.push({ level: 'notice', title: 'Interactive media or XFA forms', detail: 'The PDF uses rich media or XFA, which only some viewers support.' });
  if (submit) r.findings.push({ level: 'notice', title: 'A form can send data', detail: 'A submit action can send filled-in form fields to a web address.' });
  if (uris) r.facts.push(['Links', `${uris} web link${uris === 1 ? '' : 's'}`]);
  if (forms) r.facts.push(['Forms', 'Contains fillable form fields']);
  const eofs = [...raw.matchAll(/%%EOF/g)];
  const linearized = /\/Linearized/.test(raw.slice(0, 2048));
  const updates = eofs.length - 1 - (linearized ? 1 : 0);
  if (updates > 0) r.findings.push({ level: 'notice', title: `Edited ${updates} time${updates === 1 ? '' : 's'} after creation (incremental updates)`, detail: 'Edits were appended rather than rewritten. Earlier versions of the content, including removed text or images, may still be recoverable from this file.' });
  if (eofs.length) { let end = eofs.at(-1).index + 5; if (raw[end] === '\r') end++; if (raw[end] === '\n') end++; trailing(r, b, end, 'last %%EOF marker'); }
  else r.findings.push({ level: 'notice', title: 'No %%EOF marker', detail: 'The PDF may be truncated.' });
  if (r.format.offset) r.findings.push({ level: 'notice', title: 'Bytes before the PDF header', detail: `${r.format.offset} bytes precede the %PDF header. Viewers usually accept this, but it is unusual.` });
}

// ---------------------------------------------------------------- programs and misc
function parsePe(b, r) {
  const pe = u32le(b, 0x3c);
  if (!has(b, bytesOf('PE\0\0'), pe)) return;
  const machine = u16le(b, pe + 4), sections = u16le(b, pe + 6), stamp = u32le(b, pe + 8), chars = u16le(b, pe + 22), opt = pe + 24, magic = u16le(b, opt);
  r.facts.push(['Architecture', { 0x14c: 'x86 (32-bit)', 0x8664: 'x64 (64-bit)', 0xaa64: 'ARM64', 0x1c0: 'ARM', 0x1c4: 'ARM Thumb-2' }[machine] || `0x${machine.toString(16)}`], ['Kind', chars & 0x2000 ? 'Library (DLL)' : 'Program (EXE)']);
  const subsystem = u16le(b, opt + 68);
  r.facts.push(['Subsystem', { 1: 'Driver / native', 2: 'Windows GUI', 3: 'Console', 10: 'EFI application', 16: 'Boot application' }[subsystem] || String(subsystem)], ['Sections', String(sections)]);
  if (stamp > 0 && stamp < 0xf0000000) r.facts.push(['Build timestamp', new Date(stamp * 1000).toISOString().slice(0, 10) + ' (can be faked)']);
  const dirs = opt + (magic === 0x20b ? 112 : 96);
  const security = u32le(b, dirs + 4 * 8 + 4), clr = u32le(b, dirs + 14 * 8 + 4);
  r.facts.push(['Code signature', security ? 'Authenticode signature present (validity not checked)' : 'Not signed']);
  if (clr) r.facts.push(['Runtime', '.NET assembly']);
  let last = 0;
  for (let i = 0; i < sections; i++) { const s = opt + u16le(b, pe + 20) + i * 40; if (s + 40 > b.length) break; last = Math.max(last, u32le(b, s + 20) + u32le(b, s + 16)); }
  const certificate = security ? u32le(b, dirs + 4 * 8) + security : 0;
  const end = Math.max(last, certificate);
  if (end && end < b.length - 512) r.findings.push({ level: 'notice', title: 'Extra data appended to the program (overlay)', detail: `${formatSize(b.length - end)} after the program sections. Installers keep their payload here; malware sometimes does too.`, offset: end, save: { offset: end, length: b.length - end } });
  r.findings.push({ level: 'warn', title: 'This is a Windows program', detail: security ? 'It can run code on your computer. It carries a signature, but this tool does not verify it. Check the publisher in Windows before running it.' : 'It can run code on your computer and is not code-signed. Only run it if you trust where it came from.' });
}
function parseElf(b, r) {
  const little = b[5] === 1, r16 = o => (little ? u16le : u16be)(b, o);
  r.facts.push(['Class', b[4] === 2 ? '64-bit' : '32-bit'], ['Type', { 1: 'Object file', 2: 'Executable', 3: 'Shared library / PIE', 4: 'Core dump' }[r16(16)] || 'Other'], ['Architecture', { 3: 'x86', 0x3e: 'x86-64', 0x28: 'ARM', 0xb7: 'ARM64', 0xf3: 'RISC-V', 8: 'MIPS', 0x14: 'PowerPC', 0x15: 'PowerPC 64' }[r16(18)] || `0x${r16(18).toString(16)}`]);
  r.findings.push({ level: 'warn', title: 'This is a Linux/Unix program', detail: 'It can run code when executed. Only run it if you trust where it came from.' });
}
function parseMacho(b, r) {
  const magic = u32be(b, 0);
  if (magic === 0xcafebabe) r.facts.push(['Architectures', `${u32be(b, 4)} (universal binary)`]);
  else { const little = magic === 0xcefaedfe || magic === 0xcffaedfe, cpu = (little ? u32le : u32be)(b, 4); r.facts.push(['Architecture', { 7: 'x86', 0x1000007: 'x86-64', 12: 'ARM', 0x100000c: 'ARM64' }[cpu] || `0x${cpu.toString(16)}`]); }
  r.findings.push({ level: 'warn', title: 'This is a macOS program', detail: 'It can run code when opened. Only run it if you trust where it came from.' });
}
function parseOle(b, r) {
  const head = latin1.decode(b.subarray(0, Math.min(b.length, 20_000_000)));
  const u16 = text => [...text].join('\0');
  const kind = head.includes(u16('WordDocument')) ? 'Word 97–2003 document (.doc)' : head.includes(u16('Workbook')) || head.includes(u16('Book')) ? 'Excel 97–2003 workbook (.xls)' : head.includes(u16('PowerPoint Document')) ? 'PowerPoint 97–2003 (.ppt)' : head.includes(u16('__substg1.0_')) ? 'Outlook message (.msg)' : head.includes(u16('VisioDocument')) ? 'Visio drawing (.vsd)' : head.includes('\x40\x48\x3f\x3b') || /\.msi|Installer|MsiPatch/i.test(head.slice(0, 200000)) ? 'Windows Installer package (.msi) or similar' : null;
  if (kind) { r.format = { ...r.format, name: kind }; r.facts.push(['Content', kind]); }
  if (head.includes(u16('_VBA_PROJECT')) || head.includes(u16('Macros')) || head.includes(u16('VBA'))) r.findings.push({ level: 'warn', title: 'Contains macros (VBA code)', detail: 'Macros can run code on your computer. Do not enable content unless you trust the sender.' });
  if (head.includes(u16('ObjectPool')) || head.includes(u16('Ole10Native'))) r.findings.push({ level: 'notice', title: 'Embedded objects', detail: 'The document contains embedded OLE objects or packaged files.' });
  const summary = head.indexOf(u16('\x05SummaryInformation'));
  if (summary >= 0) r.facts.push(['Properties', 'Summary information stream present (author, dates, application)']);
}
function parseRtf(b, r) {
  const t = latin1.decode(b.subarray(0, Math.min(b.length, 30_000_000)));
  const items = [];
  for (const [label, key] of [['Title', 'title'], ['Author', 'author'], ['Operator', 'operator'], ['Company', 'company'], ['Subject', 'subject'], ['Comment', 'doccomm']]) { const m = t.match(new RegExp(`\\{\\\\${key}\\s+([^}]*)\\}`)); if (m && m[1].trim()) items.push([label, clip(m[1])]); }
  if (items.length) r.metadata.push({ group: 'Document information', items });
  if (/\\object\b|\\objdata\b/.test(t)) r.findings.push({ level: 'warn', title: 'Embedded objects in the RTF', detail: 'RTF objects have been used to deliver exploits. Open only if you trust the sender.' });
}
function parseGzip(b, r) {
  const flags = b[3], mtime = u32le(b, 4);
  if (mtime) r.facts.push(['Packed', new Date(mtime * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC']);
  if (flags & 8) { let p = 10 + (flags & 4 ? 2 + u16le(b, 10) : 0); const e = b.indexOf(0, p); r.facts.push(['Original name', clip(latin1.decode(b.subarray(p, e)))]); }
  if (b.length > 18) r.facts.push(['Unpacked size', `${formatSize(u32le(b, b.length - 4))} (mod 4 GB)`]);
}
function parseSqlite(b, r) {
  const page = u16be(b, 16) === 1 ? 65536 : u16be(b, 16), pages = u32be(b, 28);
  r.facts.push(['Page size', `${page} B`], ['Pages', String(pages)], ['Database size', formatSize(page * pages)]);
  const head = latin1.decode(b.subarray(0, Math.min(b.length, 4_000_000)));
  const tables = [...new Set([...head.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`[]?([\w$]+)/gi)].map(m => m[1]))];
  if (tables.length) r.facts.push(['Tables', tables.slice(0, 12).join(', ') + (tables.length > 12 ? ` +${tables.length - 12}` : '')]);
  if (b.length > page * pages && pages) trailing(r, b, page * pages, 'database pages');
}
function parseLnk(b, r) {
  r.findings.push({ level: 'warn', title: 'Windows shortcut', detail: 'Opening a shortcut starts whatever it points to, possibly with hidden command-line arguments. Shortcuts in e-mails or downloads are a common attack.' });
  const text = new TextDecoder('utf-16le').decode(b.subarray(76, Math.min(b.length, 64000)));
  const targets = [...new Set(text.match(/[A-Za-z]:\\[^\0]{3,200}|%[A-Za-z]+%\\[^\0]{3,200}/g) || [])].slice(0, 4);
  const ascii8 = latin1.decode(b.subarray(76, Math.min(b.length, 64000))).match(/[A-Za-z]:\\[\x20-\x7e]{3,200}/g) || [];
  const all = [...new Set([...targets, ...ascii8])].slice(0, 4);
  if (all.length) r.metadata.push({ group: 'Shortcut target', items: all.map((t, i) => [i ? `Path ${i + 1}` : 'Target', clip(t)]) });
}

// ---------------------------------------------------------------- text
const invisible = /[\u200b-\u200f\u2060-\u2064\u206a-\u206f\u00ad\u180e]/g;
const bidi = /[\u202a-\u202e\u2066-\u2069]/g;
export function analyzeText(b, r) {
  const { text, encoding } = decodeText(b.subarray(0, Math.min(b.length, 20_000_000)));
  const lines = text.split(/\r\n|\n|\r/).length, crlf = (text.match(/\r\n/g) || []).length, lf = (text.match(/(?<!\r)\n/g) || []).length, cr = (text.match(/\r(?!\n)/g) || []).length;
  r.facts.push(['Encoding', encoding], ['Lines', lines.toLocaleString('en-US')], ['Line endings', [crlf && 'Windows (CRLF)', lf && 'Unix (LF)', cr && 'old Mac (CR)'].filter(Boolean).join(' + ') || 'none'], ['Characters', [...text].length.toLocaleString('en-US')]);
  const zero = text.slice(1).match(invisible) || [];
  const bom = (text.slice(1).match(/\ufeff/g) || []).length;
  if (zero.length + bom) r.findings.push({ level: 'notice', title: 'Invisible characters in the text', detail: `${zero.length + bom} zero-width or soft-hyphen character${zero.length + bom === 1 ? '' : 's'}. They can be used to fingerprint copies of a text or to break searches.` });
  const controls = text.match(bidi) || [];
  if (controls.length) r.findings.push({ level: 'warn', title: 'Text direction override characters', detail: `${controls.length} Unicode bidi control${controls.length === 1 ? '' : 's'}. They can make code or file names display differently from what they really are (“Trojan Source”).` });
  const tags = [...text.matchAll(/(?:\udb40[\udc00-\udc7f])+/g)];
  if (tags.length) {
    const hidden = tags.map(m => [...m[0]].map(ch => String.fromCharCode(ch.codePointAt(0) - 0xe0000)).join('')).join(' ');
    r.findings.push({ level: 'warn', title: 'Hidden message in invisible Unicode tag characters', detail: `The text carries invisible characters that spell: “${clip(hidden, 200)}”. This technique hides instructions, for example for AI assistants.` });
  }
  const selectors = (text.match(/[\ufe00-\ufe0f]|\udb40[\udd00-\uddef]/g) || []).length;
  if (selectors > 40) r.findings.push({ level: 'notice', title: 'Unusual number of variation selectors', detail: `${selectors} invisible variation selectors. Large runs can be used to hide data after an emoji or letter.` });
  if (r.format.id === 'svg' && /<script\b|\son[a-z]+\s*=|javascript:/i.test(text)) r.findings.push({ level: 'warn', title: 'The SVG contains scripts', detail: 'This image can run JavaScript when opened directly in a browser.' });
  if (r.format.id === 'html' && /<script\b/i.test(text)) r.facts.push(['Scripts', `${(text.match(/<script\b/gi) || []).length} script tag(s)`]);
  if (r.format.id === 'json') { try { const v = JSON.parse(text.replace(/^\uFEFF/, '')); r.facts.push(['JSON', Array.isArray(v) ? `Array with ${v.length} items` : `Object with ${Object.keys(v || {}).length} keys`]); } catch { /* ignore */ } }
  if (r.format.id === 'text') {
    const sample = text.slice(0, 20000).split(/\r?\n/).filter(Boolean).slice(0, 20);
    if (sample.length > 2 && sample.every(line => line.split(',').length === sample[0].split(',').length && sample[0].split(',').length > 1)) r.facts.push(['Looks like', `CSV with ${sample[0].split(',').length} columns`]);
    else if (sample.length > 2 && sample.every(line => line.split('\t').length === sample[0].split('\t').length && sample[0].split('\t').length > 1)) r.facts.push(['Looks like', `Tab-separated with ${sample[0].split('\t').length} columns`]);
  }
}

// ---------------------------------------------------------------- whole-file scans
export function entropy(b, blocks = 160) {
  const histogram = (start, end, step = 1) => { const h = new Uint32Array(256); let n = 0; for (let i = start; i < end; i += step) { h[b[i]]++; n++; } let e = 0; for (const c of h) if (c) { const p = c / n; e -= p * Math.log2(p); } return e; };
  const total = histogram(0, b.length, Math.max(1, Math.floor(b.length / 8_000_000)));
  const count = Math.min(blocks, Math.max(1, Math.ceil(b.length / 256)));
  const size = b.length / count, out = [];
  for (let i = 0; i < count; i++) { const s = Math.floor(i * size), e = Math.min(b.length, Math.floor((i + 1) * size)); out.push(+histogram(s, e, Math.max(1, Math.floor((e - s) / 65536))).toFixed(2)); }
  return { overall: +total.toFixed(2), blocks: out, blockSize: Math.ceil(size) };
}

const carveSignatures = [
  ['jpeg', 'JPEG image', (b, i) => b[i] === 0xff && b[i + 1] === 0xd8 && b[i + 2] === 0xff && [0xe0, 0xe1, 0xdb, 0xee, 0xe2, 0xc0, 0xc4, 0xfe, 0xed].includes(b[i + 3])],
  ['png', 'PNG image', (b, i) => b[i] === 0x89 && has(b, [0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], i + 1)],
  ['gif', 'GIF image', (b, i) => b[i] === 0x47 && has(b, [0x49, 0x46, 0x38], i + 1) && (b[i + 4] === 0x37 || b[i + 4] === 0x39) && b[i + 5] === 0x61],
  ['pdf', 'PDF document', (b, i) => b[i] === 0x25 && has(b, [0x50, 0x44, 0x46, 0x2d], i + 1)],
  ['zip', 'ZIP archive', (b, i) => b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 3 && b[i + 3] === 4 && b[i + 5] < 0x10 && u16le(b, i + 26) > 0 && u16le(b, i + 26) < 512],
  ['rar', 'RAR archive', (b, i) => b[i] === 0x52 && has(b, bytesOf('ar!\x1a\x07'), i + 1)],
  ['7z', '7-Zip archive', (b, i) => b[i] === 0x37 && has(b, [0x7a, 0xbc, 0xaf, 0x27, 0x1c], i + 1)],
  ['exe', 'Windows program', (b, i) => b[i] === 0x4d && b[i + 1] === 0x5a && i + 0x40 < b.length && (() => { const p = u32le(b, i + 0x3c); return p > 0 && p < 1024 && has(b, bytesOf('PE\0\0'), i + p); })()],
  ['elf', 'Linux program', (b, i) => b[i] === 0x7f && has(b, [0x45, 0x4c, 0x46], i + 1) && (b[i + 4] === 1 || b[i + 4] === 2) && (b[i + 5] === 1 || b[i + 5] === 2) && b[i + 6] === 1],
  ['mp4', 'MP4 / MOV video', (b, i) => b[i] === 0x66 && has(b, bytesOf('typ'), i + 1) && i >= 4 && u32be(b, i - 4) >= 12 && u32be(b, i - 4) <= 256 && /^[\x20-\x7e]{4}$/.test(ascii(b, i + 4, 4)), -4],
  ['riff', 'RIFF media (WAV/AVI/WebP)', (b, i) => b[i] === 0x52 && has(b, bytesOf('IFF'), i + 1) && ['WAVE', 'AVI ', 'WEBP'].includes(ascii(b, i + 8, 4)) && u32le(b, i + 4) >= 12 && i + 8 + u32le(b, i + 4) <= b.length],
  ['ole', 'Legacy Office / OLE file', (b, i) => b[i] === 0xd0 && has(b, [0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], i + 1)],
  ['sqlite', 'SQLite database', (b, i) => b[i] === 0x53 && has(b, bytesOf('QLite format 3\0'), i + 1)],
  ['gzip', 'Gzip data', (b, i) => b[i] === 0x1f && b[i + 1] === 0x8b && b[i + 2] === 8 && (b[i + 3] & 0xe0) === 0 && (b[i + 9] <= 13 || b[i + 9] === 255) && b[i + 8] <= 4 && (b[i + 8] === 0 || b[i + 8] === 2 || b[i + 8] === 4)],
];

export function measureAt(b, offset, kind) {
  try {
    if (kind === 'jpeg') { const { end } = jpegWalk(b, offset); return end ? end - offset : null; }
    if (kind === 'png') { let o = offset + 8; while (o + 12 <= b.length) { const len = u32be(b, o), type = ascii(b, o + 4, 4); o += 12 + len; if (type === 'IEND') return o - offset; if (!/^[A-Za-z]{4}$/.test(type)) return null; } return null; }
    if (kind === 'riff') return Math.min(b.length - offset, u32le(b, offset + 4) + 8);
    if (kind === 'mp4') { const end = boxes(b, offset, b.length, () => {}); return end > offset ? end - offset : null; }
    if (kind === 'pdf') { const t = latin1.decode(b.subarray(offset)); const m = t.lastIndexOf('%%EOF'); return m > 0 ? m + 5 + (t[m + 5] === '\r' ? 1 : 0) + (t[m + 5 + (t[m + 5] === '\r' ? 1 : 0)] === '\n' ? 1 : 0) : null; }
    if (kind === 'zip') { const zip = zipEntries(b); if (zip && zip.entries.length && Math.min(...zip.entries.map(e => e.local)) >= offset) return zip.end - offset; const sub = zipEntries(b.subarray(offset)); return sub ? sub.end : null; }
    if (kind === 'sqlite') { const page = u16be(b, offset + 16) === 1 ? 65536 : u16be(b, offset + 16); return Math.min(b.length - offset, page * u32be(b, offset + 28)); }
  } catch { return null; }
  return null;
}

export function carve(b, r) {
  const hits = [], limit = 80;
  let zipSeen = false;
  const skip = r.zipLocals || new Set();
  const selfKind = { png: 'png', jpeg: 'jpeg', gif: 'gif', pdf: 'pdf', zip: 'zip', docx: 'zip', xlsx: 'zip', pptx: 'zip', odf: 'zip', epub: 'zip', jar: 'zip', apk: 'zip', exe: 'exe', elf: 'elf', mp4: 'mp4', mov: 'mp4', heic: 'mp4', avif: 'mp4', m4a: 'mp4', '3gp': 'mp4', wav: 'riff', avi: 'riff', webp: 'riff', ole: 'ole', sqlite: 'sqlite', gzip: 'gzip', rar: 'rar', '7z': '7z' }[r.format.id];
  const counts = {};
  for (let i = 1; i < b.length - 8; i++) {
    const c = b[i];
    if (c !== 0xff && c !== 0x89 && c !== 0x47 && c !== 0x25 && c !== 0x50 && c !== 0x52 && c !== 0x37 && c !== 0x4d && c !== 0x7f && c !== 0x66 && c !== 0xd0 && c !== 0x53 && c !== 0x1f) continue;
    for (const [kind, name, test, shift = 0] of carveSignatures) {
      if (!test(b, i)) continue;
      const at = i + shift;
      if (at <= 0) break;
      if (kind === 'zip') { if (skip.has(at) || zipSeen || selfKind === 'zip') break; zipSeen = true; }
      if (kind === 'mp4' && selfKind === 'mp4') break;
      if (kind === 'pdf' && selfKind === 'pdf') break;
      counts[name] = (counts[name] || 0) + 1;
      if (hits.length < limit) {
        const length = measureAt(b, at, kind);
        const note = r.thumbnail && r.thumbnail.offset === at ? 'EXIF thumbnail' : r.trailing && at >= r.trailing.offset ? 'after the end of the main file' : '';
        hits.push({ offset: at, kind, name, length: length && length > 0 ? length : null, note });
      }
      break;
    }
  }
  r.embedded = hits;
  r.embeddedCounts = counts;
  const outside = hits.filter(h => h.note !== 'EXIF thumbnail');
  if (outside.length && !(selfKind === 'pdf' && outside.every(h => h.kind === 'jpeg'))) {
    const summary = Object.entries(counts).map(([name, n]) => `${n} × ${name}`).join(', ');
    const severe = outside.some(h => ['exe', 'elf', 'zip', 'rar', '7z'].includes(h.kind));
    const motion = selfKind === 'jpeg' && outside.some(h => h.kind === 'mp4');
    r.findings.push({ level: severe ? 'warn' : 'notice', title: motion ? 'A video is embedded in this photo (Motion Photo)' : 'Other files are embedded inside', detail: motion ? 'Phones store a short video clip after the image. Sharing the JPEG shares the clip too. You can save it from the Contents tab.' : `Signatures found at later offsets: ${summary}. See the Contents tab to jump there or save them.` });
  }
}

const interestingPatterns = [
  ['url', 'Web address', /\bhttps?:\/\/[^\s"'<>()\\{}^`]{4,200}/g],
  ['email', 'E-mail address', /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,200}\.[A-Za-z]{2,12}\b/g],
  ['path', 'User folder path', /\b[A-Za-z]:\\(?:Users|Documents and Settings)\\[^\\\s"<>|*?:]{1,64}\\?[^\s"<>|*?]{0,160}|\/(?:Users|home)\/[a-z_][\w.-]{0,40}\/[^\s"'<>]{0,160}/g],
  ['ip', 'IP address', /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g],
  ['secret', 'Possible credential', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}\b|\bAIza[0-9A-Za-z_-]{35}\b/g],
];

export function strings(b, { min = 5, keep = 3000 } = {}) {
  const list = [], interesting = [];
  const seen = new Set();
  let total = 0;
  const visit = (text, offset, wide) => {
    total++;
    if (list.length < keep) list.push({ offset, text: text.length > 400 ? `${text.slice(0, 400)}…` : text, wide });
    for (const [kind, label, pattern] of interestingPatterns) {
      if (interesting.length >= 400) break;
      pattern.lastIndex = 0;
      for (const m of text.matchAll(pattern)) {
        let value = m[0].replace(/[.,;:)\]]+$/, '');
        if (kind === 'ip' && (/^(?:0|1|2|3|4|5|6|7|8|9)\.\d+\.\d+\.\d+$/.test(value) && !/^(?:1|8|9)\./.test(value) || /\d\.\d+\.\d+\.\d+\.\d/.test(text) || value.startsWith('0.') || /[\d.]{2}$/.test(text.slice(0, m.index).slice(-2)))) continue;
        if (kind === 'url' && /^https?:\/\/(?:www\.)?(?:w3\.org|ns\.adobe\.com|purl\.org|schemas\.(?:openxmlformats|microsoft)\.com|iptc\.org|cipa\.jp|aiim\.org|xml\.org|exif\.org|uri\.etsi\.org|www\.color\.org|c2pa\.org)/i.test(value)) continue;
        const key = `${kind}:${value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        interesting.push({ kind, label, value: value.slice(0, 240), offset: offset + (wide ? m.index * 2 : m.index) });
      }
    }
  };
  let start = -1;
  for (let i = 0; i <= b.length; i++) {
    const c = i < b.length ? b[i] : 0;
    const ok = (c >= 0x20 && c < 0x7f) || c === 9;
    if (ok) { if (start < 0) start = i; }
    else if (start >= 0) { if (i - start >= min) visit(latin1.decode(b.subarray(start, i)), start, false); start = -1; }
  }
  // UTF-16LE strings (Windows programs and Office files keep paths and names this way).
  start = -1;
  for (let i = 0; i + 1 <= b.length; i += 2) {
    const ok = i + 1 < b.length && b[i + 1] === 0 && ((b[i] >= 0x20 && b[i] < 0x7f) || b[i] === 9);
    if (ok) { if (start < 0) start = i; }
    else if (start >= 0) { if ((i - start) / 2 >= min + 1) visit(new TextDecoder('utf-16le').decode(b.subarray(start, i)), start, true); start = -1; }
  }
  start = -1;
  for (let i = 1; i + 1 <= b.length; i += 2) {
    const ok = i + 1 < b.length && b[i + 1] === 0 && ((b[i] >= 0x20 && b[i] < 0x7f) || b[i] === 9);
    if (ok) { if (start < 0) start = i; }
    else if (start >= 0) { if ((i - start) / 2 >= min + 1) visit(new TextDecoder('utf-16le').decode(b.subarray(start, i)), start, true); start = -1; }
  }
  list.sort((a, c) => a.offset - c.offset);
  return { total, list, interesting };
}

// ---------------------------------------------------------------- name checks
export function extensionOf(name) {
  const base = String(name).split(/[\\/]/).pop();
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

function checkName(r) {
  const { name, extension, format } = r;
  const known = format.extensions;
  if (/[\u202a-\u202e\u2066-\u2069]/.test(name)) r.findings.push({ level: 'warn', title: 'The file name hides its real extension', detail: 'It contains a right-to-left override character, so the name displays differently than it really is (for example “photo‮gpj.exe” shows as “photoexe.jpg”).' });
  const parts = name.toLowerCase().split('.');
  if (parts.length > 2 && /^(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|txt|mp[34]|zip|csv)$/.test(parts.at(-2)) && /^(exe|scr|com|bat|cmd|js|jse|vbs|vbe|lnk|hta|ps1|msi|pif|cpl|jar|wsf)$/.test(parts.at(-1))) r.findings.unshift({ level: 'warn', title: 'Double file extension', detail: `“${name}” looks like a .${parts.at(-2)} file but ends in .${parts.at(-1)}, which runs as a program.` });
  if (format.id === 'unknown' || format.id === 'text') {
    if (format.id === 'text' && extension && !textExtensions.has(extension) && /^(jpe?g|png|gif|webp|pdf|docx?|xlsx?|pptx?|zip|rar|7z|exe|dll|mp[34]|mov|avi|mkv|heic|wav|flac)$/.test(extension)) { r.mismatch = true; r.findings.unshift({ level: 'warn', title: 'The extension does not match the content', detail: `The name says .${extension}, but the file is plain text.` }); }
    return;
  }
  if (!extension) { if (!known.includes('')) r.findings.push({ level: 'info', title: 'No file extension', detail: `The content is a ${format.name}. Typical extensions: ${known.slice(0, 4).map(e => `.${e}`).join(', ')}.` }); return; }
  if (known.includes(extension)) return;
  if (format.family === 'text' && textExtensions.has(extension)) return;
  if (format.id === 'zip' && /^(docx|xlsx|pptx|odt|ods|odp|epub|jar|apk)$/.test(extension)) { r.mismatch = true; r.findings.unshift({ level: 'warn', title: 'Not a valid document', detail: `The name says .${extension}, but the ZIP is missing the parts that file type needs.` }); return; }
  r.mismatch = true;
  const program = format.family === 'executable' && !['jar', 'apk', 'class', 'wasm', 'dex'].includes(format.id);
  r.findings.unshift({ level: 'warn', title: program ? 'A program disguised as another file type' : 'The extension does not match the content', detail: `The name says .${extension}, but the bytes are a ${format.name}${known.length && known[0] ? ` (usually .${known[0]})` : ''}.${program ? ' Do not open it.' : ' Some apps will refuse it or open it incorrectly.'}` });
}

// ---------------------------------------------------------------- entry point
const parsers = { jpeg: parseJpeg, png: parsePng, gif: parseGif, webp: parseWebp, bmp: parseBmp, tiff: parseTiffFile, psd: parsePsd, heic: parseIso, avif: parseIso, cr3: parseIso, mp4: parseIso, mov: parseIso, m4a: parseIso, '3gp': parseIso, mp3: parseMp3, flac: parseFlac, ogg: parseOgg, wav: parseWav, avi: (b, r) => riffEnd(r, b), zip: parseZip, pdf: parsePdf, exe: parsePe, elf: parseElf, macho: parseMacho, ole: parseOle, rtf: parseRtf, gzip: parseGzip, sqlite: parseSqlite, lnk: parseLnk };

export function inspect(input, name = 'file') {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  const format = detectFormat(b);
  const r = { name, size: b.length, extension: extensionOf(name), format, facts: [], metadata: [], findings: [], entries: null, embedded: [], mismatch: false };
  try { parsers[format.id]?.(b, r); }
  catch (error) { r.findings.push({ level: 'notice', title: 'Part of the file could not be read', detail: `The ${format.name} structure looks damaged (${String(error?.message || error).slice(0, 120)}).` }); }
  if (r.format.family === 'text') analyzeText(b, r);
  checkName(r);
  r.entropy = entropy(b);
  carve(b, r);
  const s = strings(b);
  r.strings = s;
  const kinds = s.interesting.reduce((map, item) => ((map[item.kind] ||= []).push(item), map), {});
  if (kinds.secret) r.findings.unshift({ level: 'warn', title: 'Looks like a password, key or access token', detail: `${kinds.secret.length} value${kinds.secret.length === 1 ? '' : 's'} match the format of private keys or API tokens. If this file is shared, revoke those credentials.` });
  if (kinds.path) r.findings.push({ level: 'notice', title: 'Folder paths with user names', detail: `${kinds.path.slice(0, 2).map(p => clip(p.value, 80)).join(' · ')}. Paths like these reveal the account name of whoever created the file.` });
  if (kinds.email && !['text', 'json', 'html', 'xml', 'script'].includes(r.format.id)) r.findings.push({ level: 'notice', title: 'E-mail addresses inside', detail: kinds.email.slice(0, 3).map(e => e.value).join(', ') });
  if (r.format.family !== 'text' && r.format.id !== 'unknown' && !['zip', 'docx', 'xlsx', 'pptx', 'odf', 'epub', 'jar', 'apk', 'gzip', 'xz', 'bzip2', 'zstd', '7z', 'rar', 'mp4', 'mov', 'm4a', '3gp', 'webm', 'mkv', 'mp3', 'ogg', 'flac', 'jpeg', 'png', 'webp', 'heic', 'avif', 'gif', 'woff', 'woff2', 'pdf', 'cab'].includes(r.format.id) && r.entropy.overall > 7.95 && b.length > 4096) r.findings.push({ level: 'info', title: 'Very random-looking data', detail: 'The content is close to maximum entropy, which is typical for compressed or encrypted data.' });
  if (r.format.id === 'unknown' && b.length > 4096) r.findings.push({ level: 'info', title: r.entropy.overall > 7.9 ? 'Possibly encrypted or compressed data' : 'Unrecognised binary format', detail: r.entropy.overall > 7.9 ? 'No signature was found and the bytes look random. This is typical for encrypted containers (e.g. VeraCrypt) or raw compressed data.' : 'No known signature was found. The hex view and strings may still tell you what made it.' });
  const order = { warn: 0, notice: 1, info: 2 };
  r.findings.sort((a, c) => order[a.level] - order[c.level]);
  r.findings = r.findings.filter((f, i) => r.findings.findIndex(g => g.title === f.title) === i);
  delete r.zipLocals;
  return r;
}

export async function hashes(b) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const hex = buffer => [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
  const [sha256, sha1] = await Promise.all([subtle.digest('SHA-256', b), subtle.digest('SHA-1', b)]);
  return { sha256: hex(sha256), sha1: hex(sha1) };
}

// A sample that shows several findings at once: camera EXIF with GPS, a comment
// and a small ZIP appended after the JPEG end marker. Built from a JPEG the caller provides.
export function buildSample(jpeg, zip) {
  const entries = [[0x010f, 2, 'Alisoglu Optics\0'], [0x0110, 2, 'Inspector One\0'], [0x0131, 2, 'FileForge sample\0'], [0x0132, 2, '2026:11:06 18:24:00\0']];
  const tiff = new Uint8Array(512), view = new DataView(tiff.buffer);
  tiff.set([0x4d, 0x4d, 0, 42]); view.setUint32(4, 8);
  const ifd0 = [...entries.map(([tag, type, value]) => ({ tag, type, value })), { tag: 0x8769, type: 4, pointer: 'exif' }, { tag: 0x8825, type: 4, pointer: 'gps' }];
  let data = 8 + 2 + ifd0.length * 12 + 4;
  const exifAt = data; data += 2 + 2 * 12 + 4;
  const gpsAt = data; data += 2 + 4 * 12 + 4;
  const writeIfd = (at, list) => {
    view.setUint16(at, list.length);
    list.forEach((e, i) => {
      const p = at + 2 + i * 12; view.setUint16(p, e.tag); view.setUint16(p + 2, e.type);
      if (e.pointer) { view.setUint32(p + 4, 1); view.setUint32(p + 8, e.pointer === 'exif' ? exifAt : gpsAt); return; }
      if (e.type === 2) { view.setUint32(p + 4, e.value.length); if (e.value.length <= 4) tiff.set(bytesOf(e.value), p + 8); else { view.setUint32(p + 8, data); tiff.set(bytesOf(e.value), data); data += e.value.length + (e.value.length & 1); } return; }
      if (e.type === 5) { view.setUint32(p + 4, e.value.length / 2); view.setUint32(p + 8, data); e.value.forEach(v => { view.setUint32(data, v); data += 4; }); return; }
      if (e.type === 3) { view.setUint32(p + 4, 1); view.setUint16(p + 8, e.value); }
    });
    view.setUint32(at + 2 + list.length * 12, 0);
  };
  writeIfd(8, ifd0);
  writeIfd(exifAt, [{ tag: 0x9003, type: 2, value: '2026:11:06 18:24:00\0' }, { tag: 0xa430, type: 2, value: 'Sample Owner\0' }]);
  writeIfd(gpsAt, [{ tag: 1, type: 2, value: 'N\0' }, { tag: 2, type: 5, value: [52, 1, 31, 1, 1236, 100] }, { tag: 3, type: 2, value: 'E\0' }, { tag: 4, type: 5, value: [13, 1, 24, 1, 2016, 100] }]);
  const exif = new Uint8Array(6 + data); exif.set(bytesOf('Exif\0\0')); exif.set(tiff.subarray(0, data), 6);
  const segment = (marker, body) => { const s = new Uint8Array(4 + body.length); s.set([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255]); s.set(body, 4); return s; };
  const comment = new TextEncoder().encode('Sample for the FileForge file inspector. Saved by C:\\Users\\sample-user\\Pictures');
  const parts = [jpeg.subarray(0, 2), segment(0xe1, exif), segment(0xfe, comment), jpeg.subarray(2), zip];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
