// Canvas rendering engine. Templates are laid out in relative units so every template
// works at every output size (square, portrait, story, landscape).
import qrcode from '../vendor/qrcode.mjs';
import { FONT_STYLES, SIZES, ELEMENT_SIZES, tradeById } from './presets.js';
import { iconImage } from './icons.js';
import { imageFor } from './images.js';

// ---------------------------------------------------------------- color helpers
function rgb(hex) {
  let h = String(hex || '#000').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const onColor = (hex) => (luminance(hex) > 0.42 ? '#0f172a' : '#ffffff');
export function rgba(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }
function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- fonts
const BODY = { family: 'Inter', weight: '400', line: 1.3, track: 0 };
let fontsReady = null;
function ensureFonts() {
  if (!fontsReady) {
    const specs = Object.values(FONT_STYLES).map((f) => `${f.weight} 40px "${f.family}"`)
      .concat(['400 40px "Inter"', '600 40px "Inter"', '800 40px "Inter"']);
    fontsReady = Promise.all(specs.map((s) => document.fonts.load(s).catch(() => null)));
  }
  return fontsReady;
}

// ---------------------------------------------------------------- text
function setFont(ctx, size, f) {
  ctx.font = `${f.weight} ${size}px "${f.family}", "Arial Narrow", Arial, sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${((f.track || 0) * size) / 40}px`;
}

function wrap(ctx, text, maxW) {
  const lines = [];
  let tooWide = false;
  for (const para of String(text || '').split('\n')) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      if (ctx.measureText(w).width > maxW) tooWide = true;
      const test = line ? line + ' ' + w : w;
      if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = w; } else line = test;
    }
    lines.push(line);
  }
  while (lines.length > 1 && !lines[lines.length - 1]) lines.pop();
  return { lines, tooWide };
}

function ellipsize(ctx, line, maxW) {
  if (ctx.measureText(line).width <= maxW) return line;
  while (line.length > 1 && ctx.measureText(line + '…').width > maxW) line = line.slice(0, -1);
  return line.trimEnd() + '…';
}

// Draws text into a box, shrinking the font until it fits; truncates with an ellipsis as a last resort.
function fitText(ctx, text, box, o) {
  const f = o.font;
  const lineH = o.line || f.line || 1.2;
  let size = o.max;
  const min = o.min || Math.round(o.max * 0.5);
  const maxLines = o.maxLines || 99;
  const str = o.upper ? String(text || '').toUpperCase() : String(text || '');
  let lines, lh;
  for (;;) {
    setFont(ctx, size, f);
    lh = size * lineH;
    const r = wrap(ctx, str, box.w);
    lines = r.lines;
    const fits = !r.tooWide && lines.length <= maxLines && lines.length * lh <= box.h + 0.5;
    if (fits || size <= min) break;
    size = Math.max(min, Math.floor(size * 0.94));
  }
  const cap = Math.max(1, Math.min(maxLines, Math.floor((box.h + 0.5) / lh)));
  if (lines.length > cap) {
    lines = lines.slice(0, cap);
    lines[cap - 1] = ellipsize(ctx, lines[cap - 1] + '…', box.w).replace(/……$/, '…');
  }
  lines = lines.map((l) => ellipsize(ctx, l, box.w));
  const total = lines.length * lh;
  if (o.dry) return { size, height: total };
  const top = o.valign === 'bottom' ? box.y + box.h - total : o.valign === 'center' ? box.y + (box.h - total) / 2 : box.y;
  const m = ctx.measureText('Hg');
  const asc = m.actualBoundingBoxAscent || size * 0.75, desc = m.actualBoundingBoxDescent || size * 0.2;
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = 'alphabetic';
  const x = o.align === 'center' ? box.x + box.w / 2 : o.align === 'right' ? box.x + box.w : box.x;
  if (o.shadow) { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = size * 0.25; ctx.shadowOffsetY = size * 0.04; }
  lines.forEach((l, i) => ctx.fillText(l, x, top + i * lh + (lh - (asc + desc)) / 2 + asc));
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.textAlign = 'left';
  return { size, top, height: total, bottom: top + total, empty: !str.trim() };
}

// ---------------------------------------------------------------- shapes
function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function rrPath(x, y, w, h, r) {
  const p = new Path2D();
  p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath();
  return p;
}

// ---------------------------------------------------------------- building blocks
function drawIcon(T, name, color, x, y, size) {
  const img = T.icons.get(`${name}|${color}`);
  if (img) T.ctx.drawImage(img, x, y, size, size);
}

function photo(T, key, rect, path) {
  const { ctx } = T;
  const img = T.imgs[key];
  const adj = (T.p.adjust && T.p.adjust[key]) || { fx: 0.5, fy: 0.5, zoom: 1 };
  ctx.save();
  if (path) ctx.clip(path); else { ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip(); }
  let ow = 0, oh = 0;
  if (img) {
    const s = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * (adj.zoom || 1);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    ow = dw - rect.w; oh = dh - rect.h;
    ctx.drawImage(img, rect.x - ow * (adj.fx ?? 0.5), rect.y - oh * (adj.fy ?? 0.5), dw, dh);
  } else {
    const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
    g.addColorStop(0, mix(T.col.pri, '#ffffff', key === 'before' ? 0.28 : 0.16));
    g.addColorStop(1, mix(T.col.pri, '#000000', 0.25));
    ctx.fillStyle = g;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    const s = Math.min(rect.w, rect.h) * 0.22;
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    ctx.globalAlpha = 0.35;
    drawIcon(T, 'camera', '#ffffff', cx - s / 2, cy - s * 0.75, s);
    ctx.globalAlpha = 0.7;
    fitText(ctx, `Add ${key} photo`, { x: rect.x + 10, y: cy + s * 0.4, w: rect.w - 20, h: s * 0.5 },
      { font: { ...BODY, weight: '600' }, max: Math.round(s * 0.26), color: '#ffffff', align: 'center', maxLines: 1 });
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  T.slots.push({ key, x: rect.x, y: rect.y, w: rect.w, h: rect.h, path, ow, oh });
}

// Small uppercase label; returns its width.
function label(T, text, x, y, size, color, align = 'left') {
  const { ctx } = T;
  setFont(ctx, size, { family: 'Inter', weight: '800', track: 5 });
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text).toUpperCase(), x, y);
  const w = ctx.measureText(String(text).toUpperCase()).width;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  return w;
}

// Rounded pill with optional icon; returns width.
function pill(T, text, x, y, o) {
  const { ctx } = T;
  const h = o.h, size = Math.round(h * 0.42), padX = h * 0.45;
  setFont(ctx, size, { family: 'Inter', weight: o.weight || '800', track: o.track ?? 4 });
  const str = o.upper === false ? text : String(text).toUpperCase();
  const tw = ctx.measureText(str).width;
  const iw = o.icon ? h * 0.5 + h * 0.18 : 0;
  const w = padX * 2 + iw + tw;
  if (o.measure) return w;
  const px = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
  ctx.fillStyle = o.bg;
  rr(ctx, px, y, w, h, h / 2);
  ctx.fill();
  if (o.icon) drawIcon(T, o.icon, o.iconColor || o.color, px + padX, y + h * 0.25, h * 0.5);
  ctx.fillStyle = o.color;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, px + padX + iw, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  return w;
}

function badgeItems(T) {
  const c = T.c, items = [];
  if (c.rating) items.push({ text: `${c.rating} Rated`, icon: 'star-fill' });
  if (c.years) items.push({ text: `${c.years}+ Years`, icon: 'award' });
  for (const b of c.badges || []) items.push({ text: b, icon: 'shield-check' });
  if (c.license) items.push({ text: `Lic. ${c.license}`, icon: 'badge-check' });
  return items;
}

// Flowing row(s) of badge pills; returns height used.
function badges(T, x, y, maxW, o = {}) {
  if (!T.p.show.badges) return 0;
  const items = badgeItems(T);
  if (!items.length) return 0;
  const h = o.h || 46 * T.u, gap = h * 0.25, rows = o.rows || 1;
  const bg = o.bg || rgba(o.on || T.col.onPri, 0.12);
  const color = o.color || o.on || T.col.onPri;
  let row = 0, cx = 0;
  const placed = [[]];
  for (const it of items) {
    const w = pill(T, it.text, 0, 0, { h, measure: true, icon: it.icon, weight: '700', track: 2 });
    if (cx && cx + w > maxW) { if (++row >= rows) break; placed.push([]); cx = 0; }
    if (w > maxW) continue;
    placed[row].push({ ...it, w, x: cx });
    cx += w + gap;
  }
  placed.forEach((r, i) => {
    const rowW = r.reduce((s, it) => s + it.w + gap, -gap);
    const off = o.align === 'center' ? (maxW - rowW) / 2 : 0;
    r.forEach((it) => pill(T, it.text, x + off + it.x, y + i * (h + gap), { h, bg, color, icon: it.icon, iconColor: T.col.acc2, weight: '700', track: 2 }));
  });
  return placed.filter((r) => r.length).length * (h + gap) - gap;
}

function initials(name) {
  return (String(name || 'Your Company').match(/\b[A-Za-z0-9]/g) || ['P']).slice(0, 2).join('').toUpperCase();
}

// Logo (on an optional white chip) or a monogram; returns width drawn.
function logo(T, x, y, h, o = {}) {
  const { ctx } = T;
  if (!T.p.show.logo && !o.force) return 0;
  const img = T.imgs.logo;
  if (img) {
    const chip = T.c.logoChip;
    const inner = chip ? h * 0.76 : h;
    const iw = Math.min(inner * (img.naturalWidth / img.naturalHeight), o.maxW ? o.maxW - (chip ? h * 0.24 : 0) : inner * 3.2);
    const ih = Math.min(inner, iw * (img.naturalHeight / img.naturalWidth));
    const w = chip ? iw + h * 0.24 : iw;
    const px = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
    if (chip) {
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = h * 0.12; ctx.shadowOffsetY = h * 0.03;
      rr(ctx, px, y, w, h, h * 0.2); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }
    ctx.drawImage(img, px + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    return w;
  }
  const px = o.align === 'right' ? x - h : o.align === 'center' ? x - h / 2 : x;
  ctx.fillStyle = T.col.acc;
  rr(ctx, px, y, h, h, h * 0.24); ctx.fill();
  fitText(ctx, initials(T.c.name), { x: px + h * 0.1, y: y + h * 0.12, w: h * 0.8, h: h * 0.76 },
    { font: T.f, max: Math.round(h * 0.5), color: T.col.onAcc, align: 'center', valign: 'center', maxLines: 1, upper: true });
  return h;
}

function contactParts(T) {
  const c = T.c, parts = [];
  if (c.phone) parts.push({ icon: 'phone', text: c.phone });
  if (c.website) parts.push({ icon: 'globe', text: c.website.replace(/^https?:\/\//, '').replace(/\/$/, '') });
  return parts;
}

// Phone + website with icons on one line, shrinking to fit; returns height.
function contact(T, x, y, maxW, o = {}) {
  if (!T.p.show.contact) return 0;
  const { ctx } = T;
  const parts = contactParts(T);
  if (!parts.length) return 0;
  const start = o.size || 28 * T.u;
  let size = start;
  const font = { family: 'Inter', weight: o.weight || '600', track: 0 };
  const gap = () => size * 1.1, isz = () => size * 1.05;
  const width = () => { setFont(ctx, size, font); return parts.reduce((s, p) => s + isz() + size * 0.35 + ctx.measureText(p.text).width, 0) + gap() * (parts.length - 1); };
  while (width() > maxW && size > start * 0.7) size *= 0.94;
  while (width() > maxW && parts.length > 1) parts.pop();
  const total = width();
  let cx = o.align === 'center' ? x + (maxW - total) / 2 : o.align === 'right' ? x + maxW - total : x;
  ctx.textBaseline = 'middle';
  for (const p of parts) {
    drawIcon(T, p.icon, o.iconColor || T.col.acc2, cx, y + (size * 1.3 - isz()) / 2, isz());
    cx += isz() + size * 0.35;
    setFont(ctx, size, font);
    ctx.fillStyle = o.color || T.col.onPri;
    ctx.fillText(p.text, cx, y + size * 0.67);
    cx += ctx.measureText(p.text).width + gap();
  }
  ctx.textBaseline = 'alphabetic';
  return size * 1.3;
}

function qrUrl(T) {
  const u = (T.c.bookingUrl || T.c.website || '').trim();
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : 'https://' + u;
}

// QR code on a white rounded tile; returns size drawn (0 if disabled or no URL).
function qr(T, x, y, size, o = {}) {
  const url = qrUrl(T);
  if (!T.p.show.qr || !url) return 0;
  const { ctx } = T;
  const q = qrcode(0, 'M');
  q.addData(url);
  q.make();
  const n = q.getModuleCount();
  const px = o.align === 'right' ? x - size : x;
  ctx.fillStyle = '#ffffff';
  rr(ctx, px, y, size, size, size * 0.08); ctx.fill();
  const pad = size * 0.08, cell = (size - pad * 2) / n;
  ctx.fillStyle = '#0f172a';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (q.isDark(r, c)) ctx.fillRect(px + pad + c * cell, y + pad + r * cell, Math.ceil(cell), Math.ceil(cell));
  }
  if (o.caption) label(T, o.caption, px + size / 2, y + size + size * 0.13, size * 0.1, o.captionColor || T.col.onPri, 'center');
  return size;
}

// How much taller the footer must be for the chosen logo / QR sizes.
function footScale(T) {
  return Math.max(1, T.p.show.logo ? T.ls : 0, T.p.show.qr && qrUrl(T) ? T.qs : 0);
}

// Logo + company name + contact line, with optional QR at the right edge.
// `h` already includes footScale(); text is sized from the unscaled base height.
function brandFooter(T, x, y, w, h, o = {}) {
  const { ctx, u } = T;
  const on = o.on || T.col.onPri;
  const base = h / footScale(T);
  const qs = qr(T, x + w, y + h - base * T.qs, base * T.qs, { align: 'right' });
  const avail = w - (qs ? qs + 24 * u : 0);
  const lh = base * 0.86 * T.ls;
  const lw = logo(T, x, y + (h - lh) / 2, lh, { maxW: avail * (T.ls > 1 ? 0.6 : 0.45) });
  const tx = x + (lw ? lw + 22 * u : 0), tw = avail - (tx - x);
  const ty = y + (h - base) / 2;
  // Big logo + QR in a narrow panel: skip the name/contact text rather than squeeze it unreadably.
  if (lw && tw < 230 * u) return;
  const hasContact = T.p.show.contact && contactParts(T).length;
  const name = T.c.name || 'Your Company';
  const nameBox = { x: tx, y: ty + (hasContact ? base * 0.06 : base * 0.2), w: tw, h: hasContact ? base * 0.46 : base * 0.6 };
  fitText(ctx, name, nameBox, { font: T.f, max: Math.round(base * (hasContact ? 0.42 : 0.5)), color: on, maxLines: 1, upper: T.f.upper, valign: 'center' });
  if (hasContact) contact(T, tx, ty + base * 0.56, tw, { size: base * 0.26, color: rgba(on, 0.9) });
}

function tagRow(T, x, y, w, size, color) {
  const { ctx } = T;
  const tag = T.p.headline || '';
  let used = tag ? label(T, tag, x, y, size, color) : 0;
  if (T.p.location) {
    const sx = x + (used ? used + size * 1.2 : 0);
    if (sx + size * 4 < x + w) {
      drawIcon(T, 'map-pin', T.col.acc2, sx, y - size * 0.62, size * 1.24);
      setFont(ctx, size * 1.05, { family: 'Inter', weight: '600' });
      ctx.fillStyle = T.col.sub;
      ctx.textBaseline = 'middle';
      ctx.fillText(ellipsize(ctx, T.p.location, x + w - sx - size * 1.6), sx + size * 1.6, y + 1);
      ctx.textBaseline = 'alphabetic';
    }
  }
}

// Title + description + badges + footer flowing top-down inside a panel.
function infoStack(T, box, o = {}) {
  const { u } = T;
  const on = o.on || T.col.onPri;
  const footH = Math.round(Math.min((o.footH ?? Math.min(118 * u, box.h * 0.26)) * footScale(T), box.h * 0.5));
  const labelSize = o.labelSize || 22 * u;
  let y = box.y;
  if (o.tag !== false) { tagRow(T, box.x, y + labelSize * 0.6, box.w, labelSize, T.col.acc2); y += labelSize * 1.2 + 18 * u; }
  const footY = box.y + box.h - footH;
  const badgeH = T.p.show.badges && badgeItems(T).length && o.badges !== false ? (o.badgeH || 44 * u) : 0;
  const bottomLimit = footY - (badgeH ? badgeH + 28 * u : 0) - 26 * u;
  const titleMax = o.titleMax || 88 * u;
  const titleBox = { x: box.x, y, w: box.w, h: Math.max(titleMax, Math.min((bottomLimit - y) * (T.p.description ? 0.55 : 1), titleMax * (o.titleLines || 2) * T.f.line)) };
  const t = fitText(T.ctx, T.p.title || 'Your Project Title', titleBox,
    { font: T.f, max: titleMax, min: titleMax * 0.42, color: on, upper: T.f.upper, maxLines: o.titleLines || 2 });
  y = t.bottom + 16 * u;
  if (T.p.description && bottomLimit - y > 30 * u) {
    fitText(T.ctx, T.p.description, { x: box.x, y, w: box.w * (o.descW || 0.96), h: bottomLimit - y },
      { font: BODY, max: o.descMax || 32 * u, min: Math.max(20 * u, (o.descMax || 32 * u) * 0.8), color: rgba(on, 0.86), maxLines: o.descLines || 4 });
  }
  if (badgeH) badges(T, box.x, footY - badgeH - 26 * u, box.w, { h: badgeH, on, rows: 1 });
  if (o.footer !== false) {
    T.ctx.fillStyle = rgba(on, 0.16);
    T.ctx.fillRect(box.x, footY - 14 * u, box.w, 2 * u);
    brandFooter(T, box.x, footY + 6 * u, box.w, footH - 6 * u, { on });
  }
}

// ---------------------------------------------------------------- before/after photo arrangements
function beforeAfter(T, r, style) {
  const { ctx, u } = T;
  const seam = 12 * u;
  const lh = 48 * u, lp = 24 * u;
  const tagBefore = (x, y) => pill(T, 'Before', x, y, { h: lh, bg: 'rgba(15,23,42,.82)', color: '#fff' });
  const tagAfter = (x, y) => pill(T, 'After', x, y, { h: lh, bg: T.col.acc, color: T.col.onAcc });
  if (style === 'diag') {
    const a = r.x + r.w * 0.6, b = r.x + r.w * 0.4;
    const pb = new Path2D(); pb.moveTo(r.x, r.y); pb.lineTo(a, r.y); pb.lineTo(b, r.y + r.h); pb.lineTo(r.x, r.y + r.h); pb.closePath();
    const pa = new Path2D(); pa.moveTo(a, r.y); pa.lineTo(r.x + r.w, r.y); pa.lineTo(r.x + r.w, r.y + r.h); pa.lineTo(b, r.y + r.h); pa.closePath();
    photo(T, 'before', r, pb);
    photo(T, 'after', r, pa);
    ctx.strokeStyle = T.col.acc; ctx.lineWidth = seam * 1.2;
    ctx.beginPath(); ctx.moveTo(a, r.y - 5); ctx.lineTo(b, r.y + r.h + 5); ctx.stroke();
    tagBefore(r.x + lp, r.y + lp);
    tagAfter(r.x + r.w - lp - pill(T, 'After', 0, 0, { h: lh, measure: true }), r.y + r.h - lp - lh);
    return;
  }
  const stack = style === 'stack';
  const half = stack ? (r.h - seam) / 2 : (r.w - seam) / 2;
  const rb = stack ? { x: r.x, y: r.y, w: r.w, h: half } : { x: r.x, y: r.y, w: half, h: r.h };
  const ra = stack ? { x: r.x, y: r.y + half + seam, w: r.w, h: half } : { x: r.x + half + seam, y: r.y, w: half, h: r.h };
  photo(T, 'before', rb);
  photo(T, 'after', ra);
  ctx.fillStyle = T.col.acc;
  if (stack) ctx.fillRect(r.x, r.y + half, r.w, seam); else ctx.fillRect(r.x + half, r.y, seam, r.h);
  const cs = 76 * u, cx = stack ? r.x + r.w / 2 : r.x + half + seam / 2, cy = stack ? r.y + half + seam / 2 : r.y + r.h / 2;
  ctx.beginPath(); ctx.arc(cx, cy, cs / 2, 0, Math.PI * 2); ctx.fill();
  drawIcon(T, stack ? 'chevron-down' : 'chevron-right', T.col.onAcc, cx - cs * 0.3, cy - cs * 0.3, cs * 0.6);
  tagBefore(rb.x + lp, rb.y + lp);
  tagAfter(ra.x + lp, ra.y + lp);
}

function beforeAfterTemplate(style) {
  return (T) => {
    const { W, H, u, ctx } = T;
    ctx.fillStyle = T.col.pri; ctx.fillRect(0, 0, W, H);
    const pad = 60 * u;
    if (T.wide) {
      const pw = W * 0.56;
      beforeAfter(T, { x: 0, y: 0, w: pw, h: H }, style === 'diag' ? 'diag' : 'side');
      ctx.fillStyle = T.col.acc; ctx.fillRect(pw, 0, 10 * u, H);
      infoStack(T, { x: pw + pad * 0.8, y: pad * 0.75, w: W - pw - pad * 1.5, h: H - pad * 1.3 },
        { titleMax: 64 * u, descMax: 24 * u, labelSize: 18 * u, descLines: 3, badges: false, footH: 88 * u });
      return;
    }
    const ph = H * (T.tall ? 0.6 : T.portrait ? 0.6 : 0.58);
    beforeAfter(T, { x: 0, y: 0, w: W, h: ph }, style === 'diag' ? 'diag' : T.tall ? 'stack' : 'side');
    ctx.fillStyle = T.col.acc; ctx.fillRect(0, ph, W, 12 * u);
    infoStack(T, { x: pad, y: ph + pad * 0.85, w: W - pad * 2, h: H - ph - pad * 1.45 },
      { titleLines: T.tall ? 3 : 2, descLines: T.tall ? 5 : 3, titleMax: (T.tall ? 100 : 84) * u,
        badges: T.tall || T.portrait, descMax: (T.tall ? 38 : 30) * u });
  };
}

// ---------------------------------------------------------------- templates
function spotlight(T, o = {}) {
  const { W, H, u, ctx } = T;
  const pad = 60 * u;
  photo(T, T.imgs.after || !T.imgs.before ? 'after' : 'before', { x: 0, y: 0, w: W, h: H });
  if (T.wide) {
    const g = ctx.createLinearGradient(0, 0, W * 0.72, 0);
    g.addColorStop(0, rgba(T.col.pri, 0.97)); g.addColorStop(0.62, rgba(T.col.pri, 0.86)); g.addColorStop(1, rgba(T.col.pri, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    infoStack(T, { x: pad * 0.8, y: pad * 0.75, w: W * 0.5, h: H - pad * 1.3 },
      { on: T.col.onPri, titleMax: 66 * u, descMax: 24 * u, labelSize: 18 * u, descLines: 3, badges: false, footH: 86 * u });
    return;
  }
  const g = ctx.createLinearGradient(0, H * 0.3, 0, H);
  g.addColorStop(0, rgba(T.col.pri, 0)); g.addColorStop(0.45, rgba(T.col.pri, 0.82)); g.addColorStop(1, rgba(T.col.pri, 0.98));
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.3, W, H * 0.7);
  const top = ctx.createLinearGradient(0, 0, 0, 220 * u);
  top.addColorStop(0, 'rgba(0,0,0,.35)'); top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, 220 * u);
  logo(T, pad, pad * 0.8, 96 * u * T.ls, { maxW: W * 0.62 });
  if (T.imgs.before && T.imgs.after && o.inset !== false) {
    const s = W * 0.28, x = W - pad - s, y = pad * 0.8;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 30 * u;
    rr(ctx, x - 8 * u, y - 8 * u, s + 16 * u, s + 16 * u, 22 * u); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    photo(T, 'before', { x, y, w: s, h: s }, rrPath(x, y, s, s, 14 * u));
    pill(T, 'Before', x + 14 * u, y + s - 54 * u, { h: 40 * u, bg: 'rgba(15,23,42,.85)', color: '#fff' });
  }
  const boxH = H * (T.tall ? 0.42 : 0.46);
  infoStack(T, { x: pad, y: H - boxH - pad * 0.6, w: W - pad * 2, h: boxH },
    { on: T.col.onPri, titleLines: T.tall ? 3 : 2, descLines: T.tall ? 5 : 3, titleMax: (T.tall ? 110 : 90) * u, descMax: (T.tall ? 38 : 30) * u, badges: T.tall || T.portrait, ...o });
}

function showcase(T) {
  const { W, H, u, ctx } = T;
  const pad = 60 * u;
  ctx.fillStyle = T.col.pri; ctx.fillRect(0, 0, W, H);
  // subtle diagonal texture
  ctx.fillStyle = rgba(T.col.onPri, 0.04);
  for (let i = -H; i < W; i += 60 * u) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 24 * u, 0); ctx.lineTo(i + 24 * u + H, H); ctx.lineTo(i + H, H); ctx.fill(); }
  const key = T.imgs.after || !T.imgs.before ? 'after' : 'before';
  const card = (x, y, w, h) => {
    const off = 22 * u;
    ctx.fillStyle = T.col.acc; rr(ctx, x + off, y + off, w, h, 28 * u); ctx.fill();
    photo(T, key, { x, y, w, h }, rrPath(x, y, w, h, 28 * u));
  };
  if (T.wide) {
    const cw = W * 0.46, ch = H - pad * 1.6;
    card(W - pad - cw - 22 * u, pad * 0.7, cw, ch);
    infoStack(T, { x: pad * 0.8, y: pad * 0.75, w: W - cw - pad * 2.6, h: H - pad * 1.3 },
      { titleMax: 62 * u, descMax: 24 * u, labelSize: 18 * u, descLines: 3, badges: false, footH: 86 * u });
    return;
  }
  const lh = 88 * u * T.ls;
  const head = 32 * u + lh;
  const lw = logo(T, pad, pad * 0.7, lh, { maxW: W * 0.55 });
  fitText(ctx, T.c.name || 'Your Company', { x: pad + (lw ? lw + 22 * u : 0), y: pad * 0.7, w: W - pad * 2 - lw - 22 * u, h: lh },
    { font: T.f, max: 44 * u, color: T.col.onPri, upper: T.f.upper, maxLines: 1, valign: 'center' });
  const ch = H * (T.tall ? 0.46 : T.portrait ? 0.45 : 0.4);
  const cy = pad * 0.7 + head;
  card(pad, cy, W - pad * 2 - 22 * u, ch);
  const y = cy + ch + 22 * u + pad * 0.7;
  infoStack(T, { x: pad, y, w: W - pad * 2, h: H - y - pad * 0.6 },
    { titleLines: T.tall ? 3 : 2, descLines: T.tall ? 5 : 3, titleMax: (T.tall ? 96 : 72) * u, badges: T.tall || T.portrait,
      descMax: (T.tall ? 36 : 28) * u, footH: T.tall ? 118 * u : 96 * u });
}

function review(T) {
  const { W, H, u, ctx } = T;
  const pad = 70 * u;
  photo(T, T.imgs.after || !T.imgs.before ? 'after' : 'before', { x: 0, y: 0, w: W, h: H });
  ctx.fillStyle = rgba(T.col.pri, 0.86); ctx.fillRect(0, 0, W, H);
  const footH = (T.wide ? 84 : 110) * u * footScale(T);
  const starS = (T.wide ? 40 : 56) * u;
  const text = T.p.review.text || 'They showed up on time, explained every step, and left the place spotless. The results are better than we imagined!';
  const quote = `“${text.replace(/^["“]|["”]$/g, '')}”`;
  const qFont = { family: 'Inter', weight: '600', line: 1.28 };
  const qOpts = { font: qFont, max: (T.wide ? 44 : T.tall ? 64 : 56) * u, min: 22 * u, color: T.col.onPri, align: 'center', maxLines: 9 };
  const areaTop = (T.wide ? 0.6 : 1) * pad, areaBottom = H - footH - pad * 1.3;
  const nameH = 44 * u + ([T.p.title, T.p.location].some(Boolean) ? 40 * u : 0);
  const gap = 34 * u;
  const qMaxH = areaBottom - areaTop - starS - nameH - gap * 2;
  const qDry = fitText(ctx, quote, { x: pad, y: 0, w: W - pad * 2, h: qMaxH }, { ...qOpts, dry: true });
  const blockH = starS + gap + qDry.height + gap + nameH;
  const top = areaTop + Math.max(0, (areaBottom - areaTop - blockH) / 2);
  for (let i = 0; i < 5; i++) drawIcon(T, 'star-fill', T.col.acc2, W / 2 - starS * 2.75 + i * starS * 1.1, top, starS);
  const q = fitText(ctx, quote, { x: pad, y: top + starS + gap, w: W - pad * 2, h: qMaxH }, qOpts);
  const ny = q.bottom + gap;
  fitText(ctx, T.p.review.name ? `— ${T.p.review.name}` : '— Happy Customer', { x: pad, y: ny, w: W - pad * 2, h: 40 * u },
    { font: { family: 'Inter', weight: '800', line: 1.1 }, max: 32 * u, color: T.col.acc2, align: 'center', maxLines: 1 });
  const sub = [T.p.title, T.p.location].filter(Boolean).join(' · ');
  if (sub) fitText(ctx, sub, { x: pad, y: ny + 46 * u, w: W - pad * 2, h: 34 * u },
    { font: { family: 'Inter', weight: '400', line: 1.1 }, max: 26 * u, color: rgba(T.col.onPri, 0.75), align: 'center', maxLines: 1 });
  ctx.fillStyle = rgba(T.col.onPri, 0.16); ctx.fillRect(pad, H - footH - pad * 0.6 - 14 * u, W - pad * 2, 2 * u);
  brandFooter(T, pad, H - footH - pad * 0.5, W - pad * 2, footH, { on: T.col.onPri });
}

function offer(T) {
  const { W, H, u, ctx } = T;
  const pad = 60 * u;
  ctx.fillStyle = T.col.pri; ctx.fillRect(0, 0, W, H);
  const o = T.p.offer || {};
  const head = o.headline || 'Now Booking';
  const details = o.details || T.p.description || `Call today to schedule your ${(tradeById(T.c.trade).label || '').toLowerCase()} project.`;
  const cta = [o.cta || 'Call today', T.c.phone].filter(Boolean).join(' · ');
  let panel;
  if (T.wide) {
    const pw = W * 0.44;
    const path = new Path2D(); path.moveTo(W - pw, 0); path.lineTo(W, 0); path.lineTo(W, H); path.lineTo(W - pw - 90 * u, H); path.closePath();
    photo(T, T.imgs.after || !T.imgs.before ? 'after' : 'before', { x: W - pw - 90 * u, y: 0, w: pw + 90 * u, h: H }, path);
    panel = { x: pad * 0.8, y: pad * 0.7, w: W - pw - pad * 2.4, h: H - pad * 1.4 };
  } else {
    const ph = H * (T.tall ? 0.46 : 0.42);
    const path = new Path2D(); path.moveTo(0, 0); path.lineTo(W, 0); path.lineTo(W, ph - 90 * u); path.lineTo(0, ph); path.closePath();
    photo(T, T.imgs.after || !T.imgs.before ? 'after' : 'before', { x: 0, y: 0, w: W, h: ph }, path);
    ctx.strokeStyle = T.col.acc; ctx.lineWidth = 12 * u;
    ctx.beginPath(); ctx.moveTo(-5, ph + 2 * u); ctx.lineTo(W + 5, ph - 92 * u); ctx.stroke();
    logo(T, pad, pad * 0.7, 92 * u * T.ls, { maxW: W * 0.62 });
    panel = { x: pad, y: ph + 30 * u, w: W - pad * 2, h: H - ph - 30 * u - pad * 0.6 };
  }
  const { x, w } = panel;
  let y = panel.y;
  const sub = T.c.serviceArea ? `Serving ${T.c.serviceArea}` : (T.c.name || 'Special offer');
  label(T, sub, x, y + 14 * u, (T.wide ? 18 : 22) * u, T.col.acc2);
  y += 44 * u;
  const hasQr = T.p.show.qr && qrUrl(T);
  const ctaH = (T.wide ? 64 : 86) * u;
  const badgeH = !T.wide && T.p.show.badges && badgeItems(T).length ? 44 * u : 0;
  const bottom = panel.y + panel.h;
  const ctaY = bottom - ctaH - (badgeH ? badgeH + 26 * u : 0);
  const t = fitText(ctx, head, { x, y, w, h: (ctaY - y) * 0.52 },
    { font: T.f, max: (T.wide ? 84 : T.tall ? 150 : 124) * u, min: 44 * u, color: T.col.onPri, upper: T.f.upper, maxLines: 3 });
  const qSize = 170 * u * T.qs;
  fitText(ctx, details, { x, y: t.bottom + 18 * u, w: hasQr ? w - qSize - 30 * u : w, h: ctaY - t.bottom - 44 * u },
    { font: BODY, max: (T.wide ? 26 : 34) * u, min: 20 * u, color: rgba(T.col.onPri, 0.86), maxLines: 4 });
  if (hasQr) qr(T, x + w, Math.max(t.bottom + 10 * u, ctaY - qSize - 20 * u), qSize, { align: 'right' });
  ctx.fillStyle = T.col.acc;
  const ctaW = Math.min(w, 760 * u);
  rr(ctx, x, ctaY, ctaW, ctaH, ctaH / 2); ctx.fill();
  drawIcon(T, 'phone', T.col.onAcc, x + ctaH * 0.36, ctaY + ctaH * 0.27, ctaH * 0.46);
  fitText(ctx, cta, { x: x + ctaH * 1.0, y: ctaY, w: ctaW - ctaH * 1.3, h: ctaH },
    { font: { family: 'Inter', weight: '800', line: 1 }, max: ctaH * 0.4, min: 16 * u, color: T.col.onAcc, maxLines: 1, valign: 'center' });
  if (badgeH) badges(T, x, bottom - badgeH, w, { h: badgeH, rows: 1 });
}

function carousel(T, page) {
  const { W, H, u, ctx } = T;
  const pad = 60 * u;
  if (page === 0) {
    spotlight(T, { inset: false });
    pill(T, 'Swipe', W - pad, pad * 0.8 + 24 * u, { h: 48 * u, bg: T.col.acc, color: T.col.onAcc, icon: 'chevron-right', align: 'right' });
    return;
  }
  if (page === 1 || page === 2) {
    const key = page === 1 ? 'before' : 'after';
    photo(T, key, { x: 0, y: 0, w: W, h: H });
    const g = ctx.createLinearGradient(0, H * 0.65, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.65, W, H * 0.35);
    const h = (T.wide ? 64 : 88) * u;
    pill(T, key === 'before' ? 'Before' : 'After', pad, H - pad - h,
      key === 'before' ? { h, bg: 'rgba(15,23,42,.85)', color: '#fff' } : { h, bg: T.col.acc, color: T.col.onAcc });
    const lh = h * T.ls;
    logo(T, W - pad, H - pad - lh, lh, { align: 'right', maxW: W * 0.5 });
    return;
  }
  ctx.fillStyle = T.col.pri; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = T.col.acc; ctx.fillRect(0, 0, W, 14 * u);
  if (T.wide) {
    infoStack(T, { x: pad, y: pad * 0.8, w: W - pad * 2, h: H - pad * 1.4 },
      { titleMax: 60 * u, descMax: 26 * u, labelSize: 18 * u, descLines: 4, footH: 90 * u, badges: false });
    return;
  }
  infoStack(T, { x: pad, y: pad * 1.2, w: W - pad * 2, h: H - pad * 1.8 },
    { titleLines: 3, descLines: T.tall ? 12 : 8, titleMax: (T.tall ? 130 : 110) * u, descMax: (T.tall ? 46 : 40) * u, footH: 130 * u, badgeH: 50 * u });
}

export const TEMPLATES = [
  { id: 'split', label: 'Before & After', draw: beforeAfterTemplate('side') },
  { id: 'diagonal', label: 'Diagonal', draw: beforeAfterTemplate('diag') },
  { id: 'spotlight', label: 'Spotlight', draw: (T) => spotlight(T) },
  { id: 'showcase', label: 'Showcase', draw: showcase },
  { id: 'review', label: 'Review', draw: review },
  { id: 'offer', label: 'Offer', draw: offer },
  { id: 'carousel', label: 'Carousel', pages: ['Cover', 'Before', 'After', 'Details'], draw: carousel },
];
export const templateById = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
export const pageCount = (p) => (templateById(p.template).pages || [0]).length;

// ---------------------------------------------------------------- entry points
const ICON_NAMES = ['camera', 'chevron-right', 'chevron-down', 'star', 'award', 'shield-check', 'badge-check', 'phone', 'globe', 'map-pin'];

async function prepare(project, client) {
  const col = { pri: client.primary || '#102a43', acc: client.accent || '#f4c430' };
  col.onPri = onColor(col.pri);
  col.onAcc = onColor(col.acc);
  // accent used as text/icons on the primary background; fall back to on-color if contrast is poor
  const contrast = Math.abs(luminance(col.acc) - luminance(col.pri));
  col.acc2 = contrast > 0.2 ? col.acc : col.onPri;
  col.sub = rgba(col.onPri, 0.8);
  const colors = new Set([col.onPri, col.onAcc, col.acc2, '#ffffff', col.acc]);
  const [before, after, logoImg, icons] = await Promise.all([
    imageFor(project.photos.before), imageFor(project.photos.after), imageFor(client.logo),
    Promise.all([
      ...ICON_NAMES.flatMap((n) => [...colors].map((c) => iconImage(n, c).then((img) => [`${n}|${c}`, img]))),
      ...[...colors].map((c) => iconImage('star', c, 1.5, c).then((img) => [`star-fill|${c}`, img])),
    ]),
    ensureFonts(),
  ]);
  return { col, imgs: { before, after, logo: logoImg }, icons: new Map(icons) };
}

// Renders a project onto a canvas. Returns photo slots (canvas coordinates) for drag/zoom editing.
function makeT(canvas, project, client, assets, size) {
  if (canvas.width !== size.w) canvas.width = size.w;
  if (canvas.height !== size.h) canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  const W = size.w, H = size.h;
  const f = FONT_STYLES[project.font || client.font] || FONT_STYLES.anton;
  const T = {
    ctx, W, H, p: project, c: client, f, ...assets, slots: [],
    wide: W / H > 1.4, tall: H / W > 1.6, portrait: H / W > 1.15 && H / W <= 1.6,
  };
  T.u = T.wide ? (H / 628) * 0.95 : W / 1080;
  T.ls = ELEMENT_SIZES[project.logoSize || client.logoSize || 'm']?.scale || 1;
  T.qs = ELEMENT_SIZES[project.qrSize || client.qrSize || 'm']?.scale || 1;
  return T;
}

function drawTemplate(T, page) {
  T.ctx.save();
  T.ctx.clearRect(0, 0, T.W, T.H);
  const tpl = templateById(T.p.template);
  tpl.draw(T, Math.min(page, (tpl.pages || [0]).length - 1));
  T.ctx.restore();
}

// Renders a project onto a canvas. Returns photo slots (canvas coordinates) for drag/zoom editing.
export async function render(canvas, project, client, page = 0) {
  const size = SIZES[project.size] || SIZES.square;
  const T = makeT(canvas, project, client, await prepare(project, client), size);
  drawTemplate(T, page);
  return T.slots;
}

// Pieces for the video maker: decoded photos plus transparent overlay layers drawn with the
// same brand styling as the still graphics, and the finished post as the closing card.
export async function videoKit(project, client, sizeKey = 'story') {
  const size = SIZES[sizeKey] || SIZES.story;
  const assets = await prepare(project, client);
  const make = (fn, w = size.w, h = size.h) => {
    const cv = document.createElement('canvas');
    const T = makeT(cv, project, client, assets, size);
    if (w !== size.w || h !== size.h) { cv.width = w; cv.height = h; }
    fn(T);
    return cv;
  };
  const probe = makeT(document.createElement('canvas'), project, client, assets, size);
  const { W, H, u } = probe;
  const pad = 64 * u, tagH = 70 * u;
  const tpl = templateById(project.template);
  const endPage = tpl.pages ? tpl.pages.length - 1 : 0; // carousel: the details slide
  return {
    W, H, u,
    imgs: assets.imgs,
    col: assets.col,
    adjust: project.adjust || {},
    beforeTag: make((T) => pill(T, 'Before', pad, pad, { h: tagH, bg: 'rgba(15,23,42,.85)', color: '#fff' })),
    afterTag: make((T) => pill(T, 'After', pad, pad, { h: tagH, bg: T.col.acc, color: T.col.onAcc })),
    brand: make((T) => { if (T.p.show.logo) logo(T, W - pad, pad, 96 * u * T.ls, { align: 'right', maxW: W * 0.45 }); }),
    // Slider style shows both labels at once, below the corner logo.
    splitBefore: make((T) => pill(T, 'Before', pad, pad + 96 * u * T.ls + 40 * u, { h: tagH, bg: 'rgba(15,23,42,.85)', color: '#fff' })),
    splitAfter: make((T) => pill(T, 'After', W - pad, pad + 96 * u * T.ls + 40 * u, { h: tagH, bg: T.col.acc, color: T.col.onAcc, align: 'right' })),
    caption: make((T) => {
      const { ctx } = T;
      const top = H * (T.tall ? 0.56 : 0.5);
      const g = ctx.createLinearGradient(0, top, 0, H);
      g.addColorStop(0, rgba(T.col.pri, 0)); g.addColorStop(0.35, rgba(T.col.pri, 0.78)); g.addColorStop(1, rgba(T.col.pri, 0.96));
      ctx.fillStyle = g; ctx.fillRect(0, top, W, H - top);
      const boxH = (H - top) * 0.62;
      const y0 = H - boxH - pad * 0.9;
      tagRow(T, pad, y0, W - pad * 2, 26 * u, T.col.acc2);
      const t = fitText(ctx, T.p.title || 'Your Project Title', { x: pad, y: y0 + 40 * u, w: W - pad * 2, h: boxH * 0.62 },
        { font: T.f, max: (T.tall ? 120 : 96) * u, min: 50 * u, color: T.col.onPri, upper: T.f.upper, maxLines: 3 });
      if (T.p.show.contact) contact(T, pad, t.bottom + 26 * u, W - pad * 2, { size: 34 * u, color: rgba(T.col.onPri, 0.92) });
    }),
    handle: make((T) => {
      const { ctx } = T, s = 120 * u;
      ctx.fillStyle = T.col.acc;
      ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2); ctx.fill();
      drawIcon(T, 'chevron-right', T.col.onAcc, s * 0.46, s * 0.26, s * 0.48);
      ctx.save(); ctx.translate(s, 0); ctx.scale(-1, 1);
      drawIcon(T, 'chevron-right', T.col.onAcc, s * 0.46, s * 0.26, s * 0.48);
      ctx.restore();
    }, Math.round(120 * u), Math.round(120 * u)),
    endCard: make((T) => drawTemplate(T, endPage)),
  };
}

export async function renderBlob(project, client, page = 0) {
  const c = document.createElement('canvas');
  await render(c, project, client, page);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not render image'))), 'image/jpeg', 0.92));
}
