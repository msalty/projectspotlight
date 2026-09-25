import { ICONS } from './icons-data.js';

// Inline SVG markup for the app UI.
export function icon(name, cls = '') {
  return `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// Icons as images for drawing on canvas, cached per name/color/stroke.
const cache = new Map();
export function iconImage(name, color, stroke = 2, fill = 'none') {
  const key = `${name}|${color}|${stroke}|${fill}`;
  if (!cache.has(key)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
    cache.set(key, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }));
  }
  return cache.get(key);
}
