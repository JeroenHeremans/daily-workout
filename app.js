// Daily Workout — picks one strength workout per day, rotating body regions.
// Selection is deterministic from the local calendar date; users can re-roll
// up to MAX_REFRESHES times per day if they don't like today's pick.

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

function pickWorkout(data, day, offset = 0) {
  // Rotate region across the four-day cycle, then pick deterministically within the pool.
  const regionKey = REGION_ORDER[((day % REGION_ORDER.length) + REGION_ORDER.length) % REGION_ORDER.length];
  const region = data.regions[regionKey];
  if (!region || region.workouts.length === 0) {
    throw new Error(`No workouts for region ${regionKey}`);
  }
  const cycleIndex = Math.floor(day / REGION_ORDER.length) + offset;
  const idx = ((cycleIndex % region.workouts.length) + region.workouts.length) % region.workouts.length;
  return { region, workout: region.workouts[idx] };
}

function loadRefreshState(day) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { day, count: 0 };
    const parsed = JSON.parse(raw);
    if (parsed.day !== day) return { day, count: 0 };
    return { day, count: Math.min(parsed.count ?? 0, MAX_REFRESHES) };
  } catch {
    return { day, count: 0 };
  }
}

function saveRefreshState(state) {
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
  document.getElementById("region-label").textContent = `Strength · ${region.label}`;
  document.getElementById("card-title").textContent = workout.title;
  const link = document.getElementById("card-link");
  link.href = `${DAREBEE}/workouts/${workout.slug}.html`;
  const img = document.getElementById("card-img");
  img.src = `${DAREBEE}${workout.image}`;
  img.alt = workout.title;
  hide("loading");
  show("card");
}

function renderRefreshButton(state) {
  const btn = document.getElementById("refresh");
  const countEl = document.getElementById("refresh-count");
  const remaining = MAX_REFRESHES - state.count;
  countEl.textContent = `${remaining}/${MAX_REFRESHES}`;
  btn.disabled = remaining <= 0;
  btn.hidden = false;
  btn.title = remaining > 0
    ? `Get a new workout (${remaining} of ${MAX_REFRESHES} left today)`
    : "No refreshes left today";
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
  let state = loadRefreshState(day);

  render(pickWorkout(data, day, state.count));
  renderRefreshButton(state);

  const btn = document.getElementById("refresh");
  btn.addEventListener("click", () => {
    if (state.count >= MAX_REFRESHES) return;
    state = { day, count: state.count + 1 };
    saveRefreshState(state);
    render(pickWorkout(data, day, state.count));
    renderRefreshButton(state);
    btn.classList.remove("refresh--spinning");
    // Restart the spin animation by forcing a reflow before re-adding the class.
    void btn.offsetWidth;
    btn.classList.add("refresh--spinning");

    const remaining = MAX_REFRESHES - state.count;
    showToast(
      remaining === 0
        ? "No refreshes left today"
        : `${remaining} refresh${remaining === 1 ? "" : "es"} left today`
    );
  });
}

main();
