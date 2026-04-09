# Protein Daily

A daily protein structure viewer — one new protein every day of the year, rendered interactively in 3D. Live at [steamulater.com/proteins](https://steamulater.com/proteins).

![2026 Calendar — all 365 proteins color-coded by type](assets/calendar-preview.png)

## Features

- 365 curated proteins, one per day of the year
- Interactive 3D structure viewer powered by [3Dmol.js](https://3dmol.csb.pitt.edu/)
- Hybrid coloring: secondary structure for monomers, chain-based for complexes
- Cartoon-style rendering (locked — clearest view for all structures)
- Daily streak tracking with milestone badges
- Offline PDB caching via IndexedDB (cache-first loading)
- Structures fetched from [RCSB PDB](https://www.rcsb.org/)
- Full 2026 calendar page with all 365 proteins color-coded by type
- Per-protein detail pages with 3D viewer and mini calendar nav
- 365 witty blurbs for each protein (via `blurbs.js`)
- Link to [steamulater.com/play](https://steamulater.com/play) — color the same molecules in a timed game

## Running locally

```bash
bash start.sh
```

Opens at `http://localhost:3000`. The script builds the `www/` directory and starts a Python HTTP server.

## Project structure

```
├── index.html          # App shell + header with play banner
├── app.js              # ProteinApp class: viewer, navigation, streak tracker
├── proteins.js         # 365 curated protein objects (pdbId, name, type, stats…)
├── blurbs.js           # 365 witty one-line blurbs, one per protein
├── cache.js            # PDBCache: IndexedDB-based offline structure cache
├── styles.css          # Dark-crimson serif theme, responsive with clamp()
├── proteins.csv        # Protein data (source of truth for the list)
├── calendar.html       # Full 2026 calendar — all 365 proteins
├── protein.html        # Per-protein detail page with viewer + mini calendar nav
├── vendor/
│   └── 3dmol-min.js   # Bundled 3Dmol.js (no CDN dependency)
├── vercel.json         # Static site config for Vercel deployment
├── capacitor.config.json
└── start.sh            # Local dev server script
```

## Deployment

Deployed automatically to Vercel on every push to `main`. No build step — pure static files.

## Mobile (iOS / Android)

```bash
npm run build       # Copy web files to www/
npm run sync        # build + cap sync (push to native projects)
npm run open:ios    # Open in Xcode
npm run open:android # Open in Android Studio
```

> `ios/` and `android/` are gitignored — run `npx cap add ios` / `npx cap add android` to regenerate.

## Changelog

### 2026
- **Play banner** — header link inviting users to color molecules at steamulater.com/play
- **PDB accuracy pass** — fixed 200+ hallucinated PDB IDs; verified all 365 against RCSB
- **Blurbs** — added `blurbs.js` with 365 witty protein descriptions for the calendar detail page
- **Protein detail page** — per-day detail view with 3D viewer and mini calendar navigation
- **Calendar page** — full 2026 view, proteins color-coded by type, rescheduled so no two adjacent entries share a type
- **Hybrid coloring** — secondary structure coloring for monomers; chain coloring for complexes
- **Offline cache** — IndexedDB PDB cache (`ProteinDailyDB`) for offline and repeat visits
- **Streak tracker** — localStorage streak with flame badge and milestone highlights
- **Aesthetic restyle** — Libre Baskerville serif, crimson palette, matching steamulater.com
- **Cartoon-only rendering** — removed style toggle buttons; cartoon locked as default
- **Substack launch post** added to repo
- **Initial release** — 365 proteins, 3Dmol.js viewer, Capacitor mobile wrapper
