import { db } from './db.js';

export function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This image format is not supported by your browser. Try a JPG or PNG.'));
    };
    img.src = url;
  });
}

// ---------------------------------------------------------------- uploads from the phone

// The real format from the file's first bytes (file.type is often empty or wrong on phones).
async function sniff(file) {
  const b = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const txt = String.fromCharCode(...b);
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
  if (txt.startsWith('\x89PNG')) return 'png';
  if (txt.startsWith('GIF8')) return 'gif';
  if (txt.startsWith('RIFF') && txt.slice(8, 12) === 'WEBP') return 'webp';
  if (txt.slice(4, 8) === 'ftyp') {
    const brands = txt.slice(8, 40);
    if (/avif|avis/.test(brands)) return 'avif';
    if (/hei[cmsx]|hev[cmsx]|mif1|msf1/.test(brands)) return 'heic';
  }
  if (txt.startsWith('II*\0') || txt.startsWith('MM\0*')) return 'raw'; // TIFF-based: DNG / ProRAW
  if (/^\s*</.test(txt)) return 'svg';
  return 'unknown';
}

const STILL_DOWNLOADING = 'This photo couldn\'t be read — it may still be downloading from iCloud or Google Photos. Wait a moment and try again.';

// HEIC/HEIF (iPhone and some Android cameras) → JPEG, for browsers that can't decode HEIC (e.g. Chrome
// on Android). The ~1.3 MB converter only downloads the first time it is needed.
let heicLib = null;
function loadHeicLib() {
  heicLib ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/heic2any.min.js', import.meta.url).href;
    s.onload = () => (window.heic2any ? resolve(window.heic2any) : reject(new Error('HEIC converter failed to load')));
    s.onerror = () => { heicLib = null; reject(new Error(navigator.onLine ? 'Could not load the HEIC converter.' : 'Converting HEIC photos needs an internet connection the first time.')); };
    document.head.append(s);
  });
  return heicLib;
}
async function heicToJpeg(file) {
  const heic2any = await loadHeicLib();
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  return Array.isArray(out) ? out[0] : out;
}

// Decodes a photo picked on the phone, working around format quirks. Returns an <img>.
export async function decodeUpload(file) {
  if (!file || !file.size) throw new Error(STILL_DOWNLOADING);
  let kind;
  try { kind = await sniff(file); } catch { throw new Error(STILL_DOWNLOADING); }
  try {
    return await loadImage(file);
  } catch { /* fall through to the format-specific handling below */ }
  if (kind === 'heic') {
    try { return await loadImage(await heicToJpeg(file)); } catch (e) {
      throw new Error(/internet|load/.test(e.message) ? e.message
        : 'Couldn\'t convert this HEIC photo. On iPhone choose Settings → Camera → Formats → Most Compatible; on Samsung turn off "High efficiency pictures".');
    }
  }
  if (kind === 'raw') throw new Error('This is a RAW photo (DNG / ProRAW), which browsers can\'t open. Pick a regular photo, or turn off ProRAW in the camera.');
  if (kind === 'jpeg' || kind === 'png' || kind === 'webp') {
    // Usually an incomplete file (still syncing) — try once more after a moment.
    await new Promise((r) => setTimeout(r, 1200));
    try { return await loadImage(file); } catch { throw new Error(STILL_DOWNLOADING); }
  }
  throw new Error(`This file isn't a photo the app can open${kind !== 'unknown' ? ` (${kind.toUpperCase()})` : ''}. Use a JPG, PNG, WebP or HEIC photo.`);
}

// Downscale an uploaded photo so storage and sync stay fast. Browsers apply EXIF
// orientation when drawing, so the output is upright. Logos keep transparency as PNG.
export async function prepareImage(file, { maxEdge = 2160, keepAlpha = false } = {}) {
  const img = await decodeUpload(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const alpha = keepAlpha && /png|webp|gif|svg/.test(file.type);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!alpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const type = alpha ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((res) => c.toBlob(res, type, 0.86));
    if (!blob) throw new Error('Could not process this image — it may be too large for this phone. Try a smaller photo.');
    return blob;
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

// Decoded images by blob id, shared by the renderer and thumbnails.
const cache = new Map();
export function imageFor(id) {
  if (!id) return Promise.resolve(null);
  if (!cache.has(id)) {
    cache.set(id, db.getBlob(id).then((b) => (b ? loadImage(b) : null)).catch(() => null));
  }
  return cache.get(id);
}

export function forgetImage(id) {
  const p = cache.get(id);
  cache.delete(id);
  if (p) p.then((img) => img && URL.revokeObjectURL(img.src));
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export const dataURLToBlob = (url) => fetch(url).then((r) => r.blob());

// Small JPEG (max 1024px) as base64, for sending photos to the AI writer.
export async function aiImageData(id, maxEdge = 1024) {
  const img = await imageFor(id);
  if (!img) return null;
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8).split(',')[1];
}
