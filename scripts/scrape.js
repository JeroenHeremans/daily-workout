#!/usr/bin/env node
// Scrape Darebee strength workouts for each body region into workouts.json.
// Usage: node scripts/scrape.js

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

const STRENGTH = 55;
const REGIONS = [
  { key: "full",  id: 32, label: "Full Body" },
  { key: "abs",   id: 56, label: "Abs" },
  { key: "lower", id: 37, label: "Lower Body" },
  { key: "upper", id: 66, label: "Upper Body" },
];

const BASE = "https://darebee.com";
const UA = "Mozilla/5.0 (compatible; daily-workout-scraper/1.0)";
const PAGE_SIZE = 15;

function listingUrl(regionId, start) {
  const params = new URLSearchParams();
  params.append("t[]", String(STRENGTH));
  params.append("t[]", String(regionId));
  params.append("q", "");
  if (start > 0) params.append("start", String(start));
  return `${BASE}/workout.html?${params.toString()}`;
}

function fetchOnce(url, redirectsLeft = 3) {
  return new Promise((ok, fail) => {
    const req = https.get(url, { headers: { "User-Agent": UA, "Accept": "text/html" } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectsLeft <= 0) return fail(new Error(`Too many redirects for ${url}`));
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        return fetchOnce(next, redirectsLeft - 1).then(ok, fail);
      }
      if (res.statusCode !== 200) return fail(new Error(`GET ${url} -> ${res.statusCode}`));
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => ok(Buffer.concat(chunks).toString("utf8")));
      res.on("error", fail);
    });
    req.on("error", fail);
    req.setTimeout(45000, () => req.destroy(new Error(`Timeout: ${url}`)));
  });
}

async function fetchHtml(url) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await fetchOnce(url);
    } catch (err) {
      lastErr = err;
      const backoff = 500 * 2 ** (attempt - 1);
      console.warn(`  ! ${err.message} (retry ${attempt}/3 in ${backoff}ms)`);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

// Returns { items: [{slug, title, image}], lastStart: number }
function parseListing(html) {
  const items = [];
  const seen = new Set();
  // Title link gives slug + title. The image lives in a separate anchor with the same href.
  const titleRe = /<a href="\/workouts\/([^"]+)\.html" class="result__title-link"><span class="result__title-text">([^<]+)<\/span><\/a>/g;
  let m;
  while ((m = titleRe.exec(html)) !== null) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    items.push({ slug, title: m[2].trim(), image: `/images/workouts/${slug}-intro.jpg` });
  }

  let lastStart = 0;
  const lastRe = /Go to last page" href="[^"]*?start=(\d+)"/;
  const lm = html.match(lastRe);
  if (lm) lastStart = parseInt(lm[1], 10);

  return { items, lastStart };
}

async function scrapeRegion(region) {
  console.log(`\n[${region.key}] scraping strength + ${region.label}...`);
  const first = await fetchHtml(listingUrl(region.id, 0));
  const { items, lastStart } = parseListing(first);
  const all = [...items];
  console.log(`  page 1: ${items.length} items (lastStart=${lastStart})`);

  for (let start = PAGE_SIZE; start <= lastStart; start += PAGE_SIZE) {
    const html = await fetchHtml(listingUrl(region.id, start));
    const { items: more } = parseListing(html);
    all.push(...more);
    console.log(`  page ${start / PAGE_SIZE + 1}: ${more.length} items (running total ${all.length})`);
    await new Promise(r => setTimeout(r, 250)); // be polite
  }

  // De-dupe within region (paginated overlap can happen if listings shift).
  const dedup = [];
  const seen = new Set();
  for (const it of all) {
    if (seen.has(it.slug)) continue;
    seen.add(it.slug);
    dedup.push(it);
  }
  console.log(`  total unique: ${dedup.length}`);
  return dedup;
}

async function main() {
  const out = {
    generatedAt: new Date().toISOString(),
    source: BASE,
    regions: {},
  };
  for (const region of REGIONS) {
    out.regions[region.key] = {
      id: region.id,
      label: region.label,
      workouts: await scrapeRegion(region),
    };
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const target = resolve(here, "..", "workouts.json");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote ${target}`);
  for (const [k, v] of Object.entries(out.regions)) {
    console.log(`  ${k}: ${v.workouts.length} workouts`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
