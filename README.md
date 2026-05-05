# Daily Workout

A mobile-friendly static web app that picks one [Darebee](https://darebee.com/) strength workout each day, rotating through full body, abs, lower body, and upper body. Tap the card to open the workout on Darebee.

## How it works

- A Node script scrapes the four filtered listings from Darebee (strength × each body region) into `workouts.json`.
- The browser app reads that JSON and picks today's workout deterministically from the local calendar date — refreshing won't reroll, and any device shows the same workout on the same day.
- Region rotates daily in the order: full → abs → lower → upper. Within each region, workouts cycle through the full pool.

## Running locally

```sh
npm run serve   # python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Refreshing the workout list

Re-run the scraper whenever you want to pull in new workouts from Darebee:

```sh
npm run scrape  # node scripts/scrape.js
```

This rewrites `workouts.json`. Commit the result to publish it.

## Files

- `index.html`, `style.css`, `app.js` — the web app
- `workouts.json` — scraped workout index (regenerate with `npm run scrape`)
- `scripts/scrape.js` — the scraper (Node 14+, no dependencies)

## Deploying

It's a fully static site — drop the repo onto GitHub Pages, Cloudflare Pages, Netlify, or any static host. No build step required.
