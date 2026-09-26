# Project Spotlight

A mobile-first, installable web app (PWA) for contractors — electricians, plumbers, HVAC, roofers,
remodelers — to turn finished jobs into branded before & after social posts in about a minute.

## Features

- **Mobile-first UI** — bottom tab bar, sticky live preview, big tap targets, safe-area aware, works
  offline once installed, light and dark mode. Scales up to a two-column layout on desktop.
- **Multiple clients / brand kits** — each with its own trade, logo, colors, headline font, phone,
  website, license #, years in business, star rating, service area, trust badges and hashtags.
- **Trade presets** — 13 trades with suggested colors, icons, categories, badges and hashtags.
- **7 templates** — Before & After, Diagonal, Spotlight, Showcase, Review, Offer and a 4-slide Carousel.
- **4 output sizes** — Square (1:1), Portrait (4:5), Story (9:16) and Landscape (1.91:1 for Facebook /
  Google Business). Every template adapts to every size.
- **Text that fits** — headlines and descriptions shrink to fit and truncate cleanly instead of overflowing.
- **Photo positioning** — drag a photo on the preview to reposition it, pinch (or scroll) to zoom.
- **Logo, trust badges, contact line and optional QR code** on the graphics.
- **Share sheet export** (multiple images for carousels), a generated caption with hashtags that is
  copied automatically, and JPG download.
- **Local storage in IndexedDB** — photos are downscaled on upload (max 2160px) so storage stays small.
  Data from earlier versions of the app is imported automatically.
- **Google Sync** — projects and clients in a Google Sheet, photos and logos in Google Drive, so the
  app works across all your devices. Runs on a free Apps Script in your own Google account; see
  [google/README.md](google/README.md) for the 5-minute setup. Finished graphics can be saved to Drive too.
- **Write it with AI** — a few words about the job (plus, optionally, the photos) become a title,
  description, category, caption and hashtags, written by Claude through your Google script so the
  API key never reaches the phone. One tap to undo.
- **Location from photos or GPS** — GPS data in an uploaded photo, or the phone's current position,
  fills in "Town, ST" automatically (never a street address; coordinates are rounded to ~1 km).
- **Backup / restore** of everything to a single JSON file (Settings).

## Run locally

Serve the folder over HTTP (service workers and ES modules don't work from `file://`):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. There is no build step.

## Code layout

| Path | Purpose |
| --- | --- |
| `index.html`, `css/app.css` | App shell and styles |
| `js/app.js` | Hash router and start-up |
| `js/views/*.js` | Projects, project editor, clients/brand editor, settings |
| `js/render.js` | Canvas rendering engine and templates |
| `js/presets.js` | Trades, badges, fonts, sizes and record defaults |
| `js/db.js`, `js/store.js` | IndexedDB storage and in-memory cache |
| `js/images.js` | Photo downscaling and decoded image cache |
| `js/migrate.js` | One-time import from the previous version |
| `js/sync.js` | Two-way Google Sheets/Drive sync (last write wins, deletions as tombstones) |
| `js/location.js` | Photo EXIF / GPS location and place-name lookup |
| `google/Code.gs` | Apps Script backend to paste into a Google Sheet (sync, AI writing, geocoding) |
| `sw.js` | Offline cache (network-first for app code, cache-first for fonts/icons) |
| `fonts/`, `vendor/`, `js/icons-data.js` | Self-hosted fonts, QR code library (MIT), exifr EXIF reader (MIT), Lucide icons (ISC) |

## Data model

Projects and clients are plain records; photos and logos are stored as separate blobs referenced by
ID. Sync mirrors records to rows in the Google Sheet and blobs to files in Google Drive.

## GitHub Pages

The included workflow publishes the app through GitHub Pages. In repository settings, set
**Pages → Build and deployment → Source** to **GitHub Actions** if it is not already enabled.

## Ideas for later

More templates (seasonal, "we're hiring", team spotlight), scheduling posts, a finished-jobs map, and
AI-suggested template and photo crop.
