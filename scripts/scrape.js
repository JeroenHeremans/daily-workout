#!/usr/bin/env node
// Scrape Darebee strength workouts for each body region into workouts.json.
// Usage: node scripts/scrape.js

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

const STRENGTH = "strength";
const REGIONS = [
  { key: "full", query: "full-body", label: "Full Body" },
  { key: "abs", query: "abs", label: "Abs" },
  { key: "lower", query: "lower-body", label: "Lower Body" },
  { key: "upper", query: "upper-body", label: "Upper Body" },
];

const BASE = "https://darebee.com";
const INDEX_URL = `${BASE}/workouts.json`;
const UA = "Mozilla/5.0 (compatible; daily-workout-scraper/1.0)";

function fetchOnce(url, redirectsLeft = 3) {
  return new Promise((ok, fail) => {
    const req = https.get(url, { headers: { "User-Agent": UA, "Accept": "application/json,text/plain,*/*" } }, res => {
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

async function fetchJson(url) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const body = await fetchOnce(url);
      return JSON.parse(body);
    } catch (err) {
      lastErr = err;
      const backoff = 500 * 2 ** (attempt - 1);
      console.warn(`  ! ${err.message} (retry ${attempt}/3 in ${backoff}ms)`);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

function slugFromUrl(u) {
  return u.replace(/^workouts\//, "").replace(/\.html$/, "");
}

function selectRegion(index, region) {
  const items = [];
  const seen = new Set();
  for (const entry of index) {
    if (entry.ty !== STRENGTH || entry.f !== region.query) continue;
    const slug = slugFromUrl(entry.u);
    if (seen.has(slug)) continue;
    seen.add(slug);
    items.push({ slug, title: entry.t, image: `/images/workouts/${slug}-intro.jpg` });
  }
  console.log(`[${region.key}] ${region.label}: ${items.length} workouts`);
  return items;
}

async function main() {
  console.log(`Fetching ${INDEX_URL}...`);
  const index = await fetchJson(INDEX_URL);
  console.log(`  ${index.length} total workouts in index\n`);

  const out = {
    generatedAt: new Date().toISOString(),
    source: BASE,
    regions: {},
  };
  for (const region of REGIONS) {
    out.regions[region.key] = {
      label: region.label,
      query: region.query,
      workouts: selectRegion(index, region),
    };
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const target = resolve(here, "..", "workouts.json");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote ${target}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
