// Short before/after videos for Reels, Stories and TikTok, made on the device from the project's
// photos and brand. Frames are drawn on a canvas and encoded to MP4 (H.264) with WebCodecs;
// browsers without it fall back to recording the canvas in real time.
import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer.mjs';
import { videoKit } from './render.js';

export const VIDEO_STYLES = {
  reveal: { label: 'Wipe reveal', hint: 'Before, then a sweeping wipe to after' },
  slider: { label: 'Slider', hint: 'A before/after slider glides across' },
  punch: { label: 'Quick cuts', hint: 'Fast zooms and a flash cut' },
};
export const VIDEO_SIZES = {
  story: { label: '9:16', hint: 'Reels & Stories' },
  portrait: { label: '4:5', hint: 'Feed' },
  square: { label: '1:1', hint: 'Square' },
};

const FPS = 30;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- drawing helpers

function cover(ctx, img, W, H, adj = {}, zoom = 1) {
  const s = Math.max(W / img.naturalWidth, H / img.naturalHeight) * (adj.zoom || 1) * zoom;
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  ctx.drawImage(img, (W - dw) * (adj.fx ?? 0.5), (H - dh) * (adj.fy ?? 0.5), dw, dh);
}

function layer(ctx, cv, alpha = 1, dy = 0) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(cv, 0, dy);
  ctx.globalAlpha = 1;
}

function scaled(ctx, cv, W, H, scale, alpha = 1) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  const w = W * scale, h = H * scale;
  ctx.drawImage(cv, (W - w) / 2, (H - h) / 2, w, h);
  ctx.globalAlpha = 1;
}

function clipX(ctx, x0, x1, H, fn) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, 0, Math.max(0, x1 - x0), H); ctx.clip();
  fn();
  ctx.restore();
}

function bar(ctx, k, x) {
  const w = 12 * k.u;
  ctx.fillStyle = k.col.acc;
  ctx.fillRect(x - w / 2, 0, w, k.H);
  ctx.drawImage(k.handle, x - k.handle.width / 2, k.H / 2 - k.handle.height / 2);
}

// Caption slides up while fading in; the finished post fades in (and settles) at the end.
const caption = (ctx, k, t, start, out = 1) => { const a = easeOut(seg(t, start, start + 0.8)); layer(ctx, k.caption, a * out, (1 - a) * 60 * k.u); };
// Overlays (tags, logo, caption) fade out just before the closing card so the two never overlap.
const outBefore = (t, end) => 1 - seg(t, end - 0.35, end);
const endCard = (ctx, k, t, start, fade = 0.6) => scaled(ctx, k.endCard, k.W, k.H, lerp(1.04, 1, easeOut(seg(t, start, start + 1.2))), easeInOut(seg(t, start, start + fade)));

// ---------------------------------------------------------------- styles
// Each returns { duration, draw(ctx, t) } for a kit from videoKit().

function single(k) {
  const img = k.imgs.after || k.imgs.before;
  const adj = k.adjust[k.imgs.after ? 'after' : 'before'];
  const tag = k.imgs.after ? k.afterTag : k.beforeTag;
  return {
    duration: 7.5,
    draw(ctx, t) {
      cover(ctx, img, k.W, k.H, adj, lerp(1, 1.1, seg(t, 0, 5)));
      const o = outBefore(t, 4.6);
      layer(ctx, tag, seg(t, 0.2, 0.7) * o);
      layer(ctx, k.brand, seg(t, 0.2, 0.7) * o);
      caption(ctx, k, t, 0.9, o);
      endCard(ctx, k, t, 4.6);
    },
  };
}

function reveal(k) {
  const { before, after } = k.imgs;
  return {
    duration: 10.5,
    draw(ctx, t) {
      const p = easeInOut(seg(t, 3, 4.3)); // wipe progress
      if (p < 1) cover(ctx, before, k.W, k.H, k.adjust.before, lerp(1, 1.06, seg(t, 0, 4.3)));
      if (p > 0) {
        const x = p * k.W;
        clipX(ctx, 0, x, k.H, () => cover(ctx, after, k.W, k.H, k.adjust.after, lerp(1.1, 1.04, p) + 0.06 * seg(t, 4.3, 8)));
        if (p < 1) bar(ctx, k, x);
      }
      const o = outBefore(t, 7.8);
      layer(ctx, k.beforeTag, seg(t, 0.2, 0.7) * (1 - p));
      layer(ctx, k.afterTag, p * o);
      layer(ctx, k.brand, seg(t, 0.2, 0.7) * o);
      caption(ctx, k, t, 4.6, o);
      endCard(ctx, k, t, 7.8);
    },
  };
}

function slider(k) {
  const { before, after } = k.imgs;
  // Divider position over time: centre, reveal more "after", then more "before", back to centre.
  const keys = [[0, 0.5], [1.0, 0.5], [2.6, 0.12], [4.6, 0.88], [5.8, 0.5]];
  const pos = (t) => {
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) return lerp(keys[i - 1][1], keys[i][1], easeInOut(seg(t, keys[i - 1][0], keys[i][0])));
    }
    return 0.5;
  };
  return {
    duration: 11,
    draw(ctx, t) {
      const x = pos(t) * k.W;
      const z = lerp(1, 1.05, seg(t, 0, 8));
      cover(ctx, after, k.W, k.H, k.adjust.after, z);
      clipX(ctx, 0, x, k.H, () => cover(ctx, before, k.W, k.H, k.adjust.before, z));
      const o = outBefore(t, 8.3);
      ctx.globalAlpha = o; bar(ctx, k, x); ctx.globalAlpha = 1;
      const a = seg(t, 0.2, 0.7) * o;
      clipX(ctx, 0, x, k.H, () => layer(ctx, k.splitBefore, a));
      clipX(ctx, x, k.W, k.H, () => layer(ctx, k.splitAfter, a));
      layer(ctx, k.brand, a);
      caption(ctx, k, t, 6.0, o);
      endCard(ctx, k, t, 8.3);
    },
  };
}

function punch(k) {
  const { before, after } = k.imgs;
  return {
    duration: 9.5,
    draw(ctx, t) {
      const cut = 2.1;
      if (t < cut) {
        cover(ctx, before, k.W, k.H, k.adjust.before, lerp(1.22, 1, easeOut(seg(t, 0, 0.7))) + 0.03 * seg(t, 0.7, cut));
        layer(ctx, k.beforeTag, seg(t, 0.15, 0.45));
      } else {
        cover(ctx, after, k.W, k.H, k.adjust.after, lerp(1.25, 1, easeOut(seg(t, cut, cut + 0.6))) + 0.04 * seg(t, cut + 0.6, 6));
        layer(ctx, k.afterTag, seg(t, cut + 0.1, cut + 0.4) * outBefore(t, 5.8));
      }
      const flash = 1 - Math.abs(t - cut) / 0.18;
      if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash.toFixed(3)})`; ctx.fillRect(0, 0, k.W, k.H); }
      layer(ctx, k.brand, seg(t, 0.15, 0.45) * outBefore(t, 5.8));
      caption(ctx, k, t, cut + 0.7, outBefore(t, 5.8));
      endCard(ctx, k, t, 5.8, 0.35);
    },
  };
}

const PLANS = { reveal, slider, punch };

// ---------------------------------------------------------------- encoding

async function pickCodec(W, H, bitrate) {
  if (typeof VideoEncoder === 'undefined') return null;
  // H.264 first: it is what Instagram, Facebook and TikTok expect. VP9-in-MP4 is a last resort.
  const options = [
    ['avc1.640028', 'avc'], ['avc1.4d0028', 'avc'], ['avc1.640032', 'avc'], ['avc1.42e028', 'avc'],
    ['vp09.00.40.08', 'vp9'],
  ];
  for (const [codec, mux] of options) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate, framerate: FPS });
      if (supported) return { codec, mux };
    } catch { /* try the next one */ }
  }
  return null;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function encodeWebCodecs(plan, canvas, ctx, choice, bitrate, onProgress, signal) {
  const W = canvas.width, H = canvas.height;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: choice.mux, width: W, height: H, frameRate: FPS }, fastStart: 'in-memory' });
  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { failure = e; },
  });
  encoder.configure({ codec: choice.codec, width: W, height: H, bitrate, framerate: FPS });
  const frames = Math.round(plan.duration * FPS);
  try {
    for (let i = 0; i < frames; i++) {
      if (failure) throw failure;
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      plan.draw(ctx, i / FPS);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
      if (i % 6 === 0) { onProgress?.(i / frames); await tick(); }
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  muxer.finalize();
  return { blob: new Blob([target.buffer], { type: 'video/mp4' }), ext: 'mp4', instagramSafe: choice.mux === 'avc' };
}

// Fallback: record the canvas while playing the animation in real time.
async function recordRealtime(plan, canvas, ctx, bitrate, onProgress, signal) {
  if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) throw new Error('This browser can\'t make videos. Try Chrome or Safari.');
  const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  const stream = canvas.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => { rec.onstop = r; });
  rec.start(250);
  const t0 = performance.now();
  await new Promise((resolve, reject) => {
    const step = () => {
      if (signal?.aborted) { rec.stop(); return reject(new DOMException('Cancelled', 'AbortError')); }
      const t = (performance.now() - t0) / 1000;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      plan.draw(ctx, Math.min(t, plan.duration));
      onProgress?.(t / plan.duration);
      if (t >= plan.duration) return resolve();
      setTimeout(step, 1000 / FPS);
    };
    step();
  });
  rec.stop();
  await stopped;
  stream.getTracks().forEach((tr) => tr.stop());
  const type = (mime || 'video/webm').split(';')[0];
  // Plain "video/mp4" may hold VP9 in Chromium; Safari's recorder always writes H.264.
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
  const h264 = /avc1/.test(mime || '') || (type === 'video/mp4' && isSafari);
  return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm', instagramSafe: h264 };
}

// Makes the video. Returns { blob, ext, instagramSafe, duration }.
export async function makeVideo(project, client, { style = 'reveal', size = 'story', onProgress, signal } = {}) {
  const k = await videoKit(project, client, size);
  if (!k.imgs.before && !k.imgs.after) throw new Error('Add a photo first.');
  const plan = k.imgs.before && k.imgs.after ? (PLANS[style] || reveal)(k) : single(k);
  const canvas = document.createElement('canvas');
  canvas.width = k.W; canvas.height = k.H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const bitrate = Math.round(k.W * k.H * FPS * 0.1); // ~6 Mbps at 1080×1920
  const choice = await pickCodec(k.W, k.H, bitrate);
  const out = choice
    ? await encodeWebCodecs(plan, canvas, ctx, choice, bitrate, onProgress, signal)
    : await recordRealtime(plan, canvas, ctx, bitrate, onProgress, signal);
  onProgress?.(1);
  return { ...out, duration: plan.duration };
}
