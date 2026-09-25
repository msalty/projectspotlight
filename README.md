# Project Spotlight

A lightweight, local-first PWA for contractors and small renovation businesses to turn before/after project photos into branded social graphics.

## Prototype features

- Installable PWA shell with offline app caching
- Project dashboard and project history
- Capture/select before and after photos on mobile
- Project title, description, category and location
- Persistent Brand Kit (logo, company details, colors, tagline)
- Four canvas-rendered layouts: Before & After, Project Spotlight, Portrait, Story
- High-resolution JPEG export
- Native Web Share when file sharing is supported, with download fallback
- IndexedDB local storage for projects and photos
- GitHub Pages deployment workflow

## Run locally

Serve the repository over localhost (service workers do not work from a plain `file://` URL):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Data

This prototype stores project records and image blobs locally in IndexedDB. The data layer is intentionally isolated so a later phase can add Google Apps Script + Google Sheets + Google Drive synchronization without changing the core editing workflow.

## GitHub Pages

The included workflow publishes the static PWA through GitHub Pages. In repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** if it is not already enabled.

## Next phase

Google synchronization, multi-device project history, additional templates, richer crop/position controls, and optional copy-assistance can be layered onto this prototype.
