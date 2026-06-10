// Daily Workout — picks one strength workout per day, rotating body regions.
// Selection is deterministic from the local calendar date; users can re-roll
// up to MAX_REFRESHES times per day if they don't like today's pick. Region
// can also be overridden via a dropdown; switching region is free, but
// refreshes within a region count toward the same global cap.

const REGION_ORDER = ["full", "abs", "lower", "upper"];
const DAREBEE = "https://darebee.com";
const MAX_REFRESHES = 3;
const STORAGE_KEY = "dw.refresh";

// Days since 1970-01-01 in the user's local timezone.
function localDayIndex(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor(local.getTime() / 86400000);
}

function formatDate(date = new Date()) {
  return date.toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function defaultRegionForDay(day) {
  return REGION_ORDER[((day % REGION_ORDER.length) + REGION_ORDER.length) % REGION_ORDER.length];
}

function pickWorkout(data, day, regionKey, offset) {
  const region = data.regions[regionKey];
  if (!region || region.workouts.length === 0) {
    throw new Error(`No workouts for region ${regionKey}`);
  }
  const cycleIndex = Math.floor(day / REGION_ORDER.length) + offset;
  const idx = ((cycleIndex % region.workouts.length) + region.workouts.length) % region.workouts.length;
  return { region, workout: region.workouts[idx] };
}

function totalRefreshes(state) {
  return Object.values(state.offsets).reduce((sum, n) => sum + n, 0);
}

function freshState(day) {
  return { day, region: defaultRegionForDay(day), offsets: {} };
}

function loadState(day) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState(day);
    const parsed = JSON.parse(raw);
    if (parsed.day !== day) return freshState(day);
    const offsets = (parsed.offsets && typeof parsed.offsets === "object") ? parsed.offsets : {};
    const region = REGION_ORDER.includes(parsed.region) ? parsed.region : defaultRegionForDay(day);
    const state = { day, region, offsets };
    // Clamp in case storage was tampered with so the cap can't be exceeded.
    if (totalRefreshes(state) > MAX_REFRESHES) state.offsets = {};
    return state;
  } catch {
    return freshState(day);
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be unavailable (private mode, quota); refreshes still work for the session.
  }
}

function show(id) { document.getElementById(id).hidden = false; }
function hide(id) { document.getElementById(id).hidden = true; }

let toastTimer = null;
function showToast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("toast--visible");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("toast--visible");
  }, 2400);
}

function render({ region, workout }) {
  document.getElementById("date").textContent = formatDate();
  document.getElementById("card-title").textContent = workout.title;
  const link = document.getElementById("card-link");
  link.href = `${DAREBEE}/workouts/${workout.slug}.html`;

  const img = document.getElementById("card-img");
  const mediaEl = document.getElementById("card-media");
  const newSrc = `${DAREBEE}${workout.image}`;
  img.alt = workout.title;

  if (img.getAttribute("src") !== newSrc) {
    mediaEl.classList.add("card__media--loading");
    const done = () => mediaEl.classList.remove("card__media--loading");
    img.onload = done;
    img.onerror = done;
    img.src = newSrc;
    // If the browser served the image synchronously from cache, drop the loader immediately.
    if (img.complete && img.naturalWidth > 0) done();
  }

  hide("loading");
  show("card");
}

function renderRefreshButton(state) {
  const btn = document.getElementById("refresh");
  const countEl = document.getElementById("refresh-count");
  const used = totalRefreshes(state);
  const remaining = MAX_REFRESHES - used;
  countEl.textContent = `${remaining}/${MAX_REFRESHES}`;
  btn.disabled = remaining <= 0;
  btn.hidden = false;
  btn.title = remaining > 0
    ? `Get a new workout (${remaining} of ${MAX_REFRESHES} left today)`
    : "No refreshes left today";
}

function populateRegionSelect(data, currentRegion) {
  const select = document.getElementById("region-select");
  select.innerHTML = "";
  for (const key of REGION_ORDER) {
    const region = data.regions[key];
    if (!region) continue;
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = region.label;
    if (key === currentRegion) opt.selected = true;
    select.appendChild(opt);
  }
}

async function main() {
  let data;
  try {
    const res = await fetch("workouts.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load workouts.json (${res.status})`);
    data = await res.json();
  } catch (err) {
    console.error(err);
    const el = document.getElementById("error");
    el.textContent = `Couldn't load today's workout: ${err.message}`;
    hide("loading");
    show("error");
    return;
  }

  const day = localDayIndex();
  let state = loadState(day);

  populateRegionSelect(data, state.region);
  render(pickWorkout(data, day, state.region, state.offsets[state.region] ?? 0));
  renderRefreshButton(state);

  const btn = document.getElementById("refresh");
  btn.addEventListener("click", () => {
    if (totalRefreshes(state) >= MAX_REFRESHES) return;
    const nextOffset = (state.offsets[state.region] ?? 0) + 1;
    state = {
      ...state,
      offsets: { ...state.offsets, [state.region]: nextOffset },
    };
    saveState(state);
    render(pickWorkout(data, day, state.region, nextOffset));
    renderRefreshButton(state);
    btn.classList.remove("refresh--spinning");
    // Restart the spin animation by forcing a reflow before re-adding the class.
    void btn.offsetWidth;
    btn.classList.add("refresh--spinning");

    const remaining = MAX_REFRESHES - totalRefreshes(state);
    showToast(
      remaining === 0
        ? "No refreshes left today"
        : `${remaining} refresh${remaining === 1 ? "" : "es"} left today`
    );
  });

  const select = document.getElementById("region-select");
  select.addEventListener("change", (event) => {
    const nextRegion = event.target.value;
    if (!REGION_ORDER.includes(nextRegion)) return;
    state = { ...state, region: nextRegion };
    saveState(state);
    render(pickWorkout(data, day, nextRegion, state.offsets[nextRegion] ?? 0));
  });
}

main();
