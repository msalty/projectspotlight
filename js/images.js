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

// Downscale an uploaded photo so storage and (later) sync stay fast. Browsers apply EXIF
// orientation when drawing, so the output is upright. Logos keep transparency as PNG.
export async function prepareImage(file, { maxEdge = 2160, keepAlpha = false } = {}) {
  const img = await loadImage(file);
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
    if (!blob) throw new Error('Could not process this image.');
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
