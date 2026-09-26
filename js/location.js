// Job location from photo EXIF data or the phone's GPS, turned into a "Town, ST" place name.
// Only the town and state are used; coordinates are rounded to ~1 km before they are stored.
import { parse as exifParse } from '../vendor/exifr-lite.mjs';
import { getConfig, isConnected, serverCall } from './sync.js';

const round = (n) => Math.round(n * 100) / 100;

// Reads GPS position and capture time from the original photo (downscaling strips EXIF, so call this first).
export async function photoMeta(file) {
  const meta = {};
  try {
    const d = await exifParse(file); // default options include GPS (as latitude/longitude) and dates
    if (d && Number.isFinite(d.latitude) && Number.isFinite(d.longitude) && (d.latitude || d.longitude)) {
      meta.lat = round(d.latitude);
      meta.lon = round(d.longitude);
    }
    const taken = d && d.DateTimeOriginal;
    if (taken instanceof Date && !isNaN(taken)) meta.taken = taken.getTime();
  } catch { /* no EXIF, or a format the parser doesn't know */ }
  return meta;
}

export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser can\'t share your location.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: round(p.coords.latitude), lon: round(p.coords.longitude) }),
      (e) => reject(new Error(e.code === 1
        ? 'Location access is off for this app. Turn it on in your browser or phone settings.'
        : 'Couldn\'t get your location. Try again outdoors or type it in.')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

const cache = new Map();

// "West Chester, PA" for a coordinate. Uses Google (through your sync script) when connected,
// otherwise OpenStreetMap's free Nominatim service.
export async function placeName(lat, lon) {
  const key = `${lat},${lon}`;
  if (cache.has(key)) return cache.get(key);
  let place = '';
  if (isConnected(await getConfig())) {
    try { place = (await serverCall('geocode', { lat, lon })).place || ''; } catch { /* older script or quota: fall back */ }
  }
  if (!place) place = await nominatim(lat, lon);
  if (place) cache.set(key, place);
  return place;
}

async function nominatim(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&lat=${lat}&lon=${lon}`;
  let res;
  try { res = await fetch(url, { headers: { 'Accept-Language': navigator.language || 'en' } }); } catch {
    throw new Error(navigator.onLine ? 'Couldn\'t look up the place name.' : 'You\'re offline — type the location in.');
  }
  if (!res.ok) throw new Error('Couldn\'t look up the place name.');
  const a = (await res.json()).address || {};
  const town = a.city || a.town || a.village || a.hamlet || a.municipality || a.suburb || a.county || '';
  const iso = a['ISO3166-2-lvl4'] || '';
  const region = /^(US|CA|AU)-/.test(iso) ? iso.split('-')[1] : (a.state || '');
  return [town, region].filter(Boolean).join(', ') || a.country || '';
}
