# ONDA — World Radio Broadcast Tuner

A fast, zero-build static web application designed for **GitHub Pages** that lets you browse, search, filter, and stream live internet radio stations from around the world using the free, open-source **[Radio Browser API](https://www.radio-browser.info/)**.

## Features

- **Live Mirror Discovery & Failover**: Discovers active community servers dynamically via `https://all.api.radio-browser.info/json/servers`, randomizes mirror selection, and automatically fails over if any mirror is slow or unavailable.
- **Multi-Facet Browsing & Search**:
  - Instant search by station name, call sign, or city (`/` shortcut).
  - Browse dedicated searchable directories for **Genres / Tags**, **Countries** (with ISO flags), and **Languages**.
  - Filter simultaneously by Country, Genre, Language, Codec (`MP3`, `AAC`, `OGG`, `FLAC`), minimum bitrate (`128+`, `192+`, `256+` kbps), and Sort order (`Most Popular`, `Trending Now`, `Top Voted`, `Highest Bitrate`, `Name A–Z`, `Random`).
  - Curated quick-tuner presets + **Surprise Me** (`R`) random station discovery.
- **GitHub Pages Ready Streaming Engine**:
  - Uses resolved stream URLs (`url_resolved`) with automatic fallback to `url`.
  - Supports both direct audio streams (MP3/AAC/OGG/FLAC) and adaptive **HLS (`.m3u8`)** broadcasts via `hls.js` + native Safari HLS.
  - **HTTPS-only filter** automatically enabled when hosted over HTTPS (like GitHub Pages) to avoid browser mixed-content stream blocks.
  - Respects Radio Browser API guidelines: identifies stations exclusively by persistent `stationuuid`, reports clicks via `/json/url/{stationuuid}`, and supports community upvoting via `/json/vote/{stationuuid}`.
- **Persistent Hi-Fi Player Deck**:
  - Live ON AIR status indicator, animated VU meter, listening session timer, volume & mute (`M`), sleep timer (`15m`, `30m`, `60m`), and OS lock-screen / hardware media key support (`Media Session API`).
  - Save favorite stations locally (with UUID refresh, JSON export/import, and recent listening history) and share direct station links (`?station=<uuid>`).
  - Light (warm archival paper) & Dark (night broadcast) themes.

## Project Structure

```text
├── index.html                  # Semantic HTML5 shell & persistent player deck
├── favicon.svg                 # Broadcast wave icon
├── .nojekyll                   # Disable Jekyll on GitHub Pages
├── .github/workflows/pages.yml # Automated GitHub Pages deployment workflow
├── styles/
│   └── main.css                # Vanilla CSS design system (light/dark, responsive)
└── js/
    ├── api.js                  # Radio Browser mirror discovery, failover & endpoints
    ├── player.js               # HTML5 Audio + HLS.js streaming engine & VU meter
    ├── storage.js              # LocalStorage favorites, history & preferences
    └── app.js                  # UI views, filtering, modal, deep-linking & shortcuts
```

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings → Pages** in your repository.
3. Under **Build and deployment**, set **Source** to **GitHub Actions** (uses `.github/workflows/pages.yml`) — or choose **Deploy from a branch** (`master` / `main`, `/ (root)`).
4. Once deployed, open `https://<your-username>.github.io/<repo-name>/`.

## Running Locally

Because the app uses ES modules (`<script type="module">`), serve the directory with any lightweight static server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `/` | Focus search bar |
| `Space` | Play / Pause current station |
| `[` / `]` | Previous / Next station in current list |
| `M` | Mute / Unmute |
| `R` | Surprise Me (tune a random station) |
| `Esc` | Close station details modal |
