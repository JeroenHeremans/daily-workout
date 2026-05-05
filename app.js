// Daily Workout — picks one strength workout per day, rotating body regions.
// Selection is deterministic from the local calendar date so refreshes don't reroll.

const REGION_ORDER = ["full", "abs", "lower", "upper"];
const DAREBEE = "https://darebee.com";

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

function pickToday(data, day) {
  // Rotate region across the four-day cycle, then pick deterministically within the pool.
  const regionKey = REGION_ORDER[((day % REGION_ORDER.length) + REGION_ORDER.length) % REGION_ORDER.length];
  const region = data.regions[regionKey];
  if (!region || region.workouts.length === 0) {
    throw new Error(`No workouts for region ${regionKey}`);
  }
  const cycleIndex = Math.floor(day / REGION_ORDER.length);
  const idx = ((cycleIndex % region.workouts.length) + region.workouts.length) % region.workouts.length;
  return { region, workout: region.workouts[idx] };
}

function show(id) { document.getElementById(id).hidden = false; }
function hide(id) { document.getElementById(id).hidden = true; }

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

async function main() {
  try {
    const res = await fetch("workouts.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load workouts.json (${res.status})`);
    const data = await res.json();
    const day = localDayIndex();
    render(pickToday(data, day));
  } catch (err) {
    console.error(err);
    const el = document.getElementById("error");
    el.textContent = `Couldn't load today's workout: ${err.message}`;
    hide("loading");
    show("error");
  }
}

main();
