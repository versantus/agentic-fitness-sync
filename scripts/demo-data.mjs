#!/usr/bin/env node
// Generates a realistic, deterministic demo cache (18 months of a 4-day programme) so the
// dashboard can be tried — and README screenshots reproduced — without a Trainerize account.
//
//   TRAINERIZE_HOME=/tmp/tz-demo node scripts/demo-data.mjs
//   TRAINERIZE_HOME=/tmp/tz-demo node skills/trainerize-strength/bin/cli.js serve
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HOME = process.env.TRAINERIZE_HOME;
if (!HOME || /\.trainerize\/?$/.test(HOME)) {
  console.error('Set TRAINERIZE_HOME to an empty demo folder (not your real ~/.trainerize).');
  process.exit(1);
}

// Seeded PRNG (mulberry32) so every run produces the same data.
let seed = 20260925;
const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const jitter = (n = 1) => (rand() - 0.5) * 2 * n;

// [id, name, mainMuscle tag, equipment, starting e1RM kg (0 = bodyweight), kg gained per week, plate step]
const EX = {
  squat:    [101, 'Back Squat', 'quads', 'barbell', 95, 0.32, 2.5],
  rdl:      [102, 'Romanian Deadlift', 'hamstrings', 'barbell', 90, 0.28, 2.5],
  lunge:    [103, 'Walking DB Lunge', 'glutes', 'dumbbell', 40, 0.08, 2],
  curl:     [104, 'Lying Leg Curl', 'hamstrings', 'machine', 45, 0.07, 2.5],
  calf:     [105, 'SL Calf Raise', 'calves', 'dumbbell', 30, 0.04, 2],
  plank:    [106, 'Plank', 'abs', 'bodyweight', 0, 0, 0],
  bench:    [201, 'Barbell Bench Press', 'chestMid', 'barbell', 72, 0.18, 2.5],
  row:      [202, 'Chest-Supported DB Row', 'middleBack', 'dumbbell', 55, 0.1, 2],
  incline:  [203, '30° Incline DB Press', 'chestUpper', 'dumbbell', 50, 0.1, 2],
  pulldown: [204, 'Lat Pulldown', 'lats', 'cable', 70, 0.12, 2.5],
  lateral:  [205, 'DB Lateral Raise', 'shoulderSide', 'dumbbell', 16, 0.02, 1],
  pushdown: [206, 'Rope Tricep Pushdown', 'triceps', 'cable', 35, 0.05, 2.5],
  dead:     [301, 'Deadlift', 'hamstrings', 'barbell', 125, 0.38, 2.5],
  front:    [302, 'Front Squat', 'quads', 'barbell', 75, 0.22, 2.5],
  thrust:   [303, 'Barbell Hip Thrust', 'glutes', 'barbell', 110, 0.35, 2.5],
  legext:   [304, 'Leg Extension', 'quads', 'machine', 55, 0.08, 2.5],
  deadbug:  [305, 'Dead Bug', 'abs', 'bodyweight', 0, 0, 0],
  ohp:      [401, 'Overhead Press', 'shoulderFront', 'barbell', 48, 0.1, 2.5],
  pullup:   [402, 'Weighted Pull-up', 'lats', 'bodyweight', 85, 0.12, 2.5],
  cablerow: [403, 'Seated Cable Row', 'middleBack', 'cable', 72, 0.12, 2.5],
  facepull: [404, 'Face Pull', 'shoulderRear', 'cable', 30, 0.04, 2.5],
  dbcurl:   [405, 'Incline DB Curl', 'bicep', 'dumbbell', 18, 0.03, 1],
  fly:      [406, 'Cable Fly', 'chestInner', 'cable', 25, 0.04, 2.5],
  shrug:    [407, 'DB Shrug', 'traps', 'dumbbell', 70, 0.08, 2],
  obliques: [408, 'Cable Woodchop', 'obliques', 'cable', 25, 0.03, 2.5],
  // Deliberately long name: real Trainerize libraries have these, and they used to break the mobile layout.
  hkrow:    [409, 'Half-Kneeling Single-Arm Cable High-to-Low Row (Neutral Grip)', 'middleBack', 'cable', 30, 0.05, 2.5],
};
const MAIN = new Set(['squat', 'bench', 'dead', 'ohp']);
const DAYS = {
  1: ['Lower A', ['squat', 'rdl', 'lunge', 'curl', 'calf', 'plank']],
  2: ['Upper A', ['bench', 'row', 'incline', 'pulldown', 'lateral', 'pushdown']],
  4: ['Lower B', ['dead', 'front', 'thrust', 'legext', 'deadbug']],
  6: ['Upper B', ['ohp', 'pullup', 'cablerow', 'facepull', 'dbcurl', 'fly', 'shrug', 'obliques', 'hkrow']],
};
// 8-week blocks: hypertrophy → strength → peak, each ending in a deload week.
const BLOCKS = [
  { main: [3, 10], acc: [3, 12] }, { main: [4, 6], acc: [3, 10] }, { main: [5, 3], acc: [3, 8] },
];

const ymd = d => d.toISOString().slice(0, 10);
const today = new Date(); today.setUTCHours(0, 0, 0, 0);
const start = new Date(today); start.setUTCDate(start.getUTCDate() - 7 * 78);
start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7)); // Monday

rmSync(HOME, { recursive: true, force: true });
mkdirSync(join(HOME, 'cache', 'workouts'), { recursive: true });

const calendar = [];
let id = 900000, week = 0;
const holidays = new Set([22, 23, 49, 61]); // weeks away
for (const d = new Date(start); d <= new Date(today.getTime() + 14 * 864e5); d.setUTCDate(d.getUTCDate() + 1)) {
  const dow = d.getUTCDay(), date = ymd(d);
  if (dow === 1 && d > start) week++;
  const future = d > today;
  if (dow === 3 && !future && rand() < 0.55) calendar.push({ id: id++, date, type: 'cardio', status: 'tracked', title: 'Zone 2 run' });
  const day = DAYS[dow];
  if (!day) continue;
  const [title, lifts] = day;
  const wid = id++;
  if (future) { calendar.push({ id: wid, date, type: 'workoutRegular', status: 'scheduled', title: `/ ${title}` }); continue; }
  if (holidays.has(week) || rand() < 0.07) { calendar.push({ id: wid, date, type: 'workoutRegular', status: 'scheduled', title: `/ ${title}` }); continue; }

  const bi = (Math.floor(week / 8) + 1) % BLOCKS.length; // offset so the demo ends mid strength block
  const block = BLOCKS[bi], weekInBlock = week % 8, deload = weekInBlock === 7;
  const testWeek = weekInBlock === 6 && bi === 2; // singles at the end of a peak block
  const exercises = lifts.map(key => {
    const [eid, name, muscle, equipment, base, gain, step] = EX[key];
    let [sets, reps] = MAIN.has(key) ? block.main : block.acc;
    if (key === 'plank' || key === 'deadbug') reps = key === 'plank' ? 1 : 10;
    if (deload) sets = Math.max(2, sets - 1);
    // Strength follows a gentle wave on top of steady progress, with a dip after each holiday.
    const e1 = base + gain * week + 2.5 * Math.sin((week - 70) / 5) - (holidays.has(week - 1) ? base * 0.04 : 0) + jitter(1.2);
    const pct = deload ? 0.84 : 0.9 + jitter(0.015);
    const round = w => step ? Math.max(step, Math.round(w / step) * step) : 0;
    const stats = [];
    for (let s = 1; s <= sets; s++) {
      const r = testWeek && MAIN.has(key) && s === sets ? 1 : Math.max(1, reps - (s === sets && rand() < 0.3 ? 1 : 0));
      const w = base ? round((e1 / (1 + (r === 1 ? 0 : r) / 30)) * (r === 1 ? 0.97 : pct)) : null;
      stats.push({ setID: s, reps: key === 'plank' ? 1 : r, weight: key === 'pullup' ? Math.max(0, round((w ?? 0) - 75)) : w });
    }
    return { dailyExerciseID: wid * 10 + eid, def: { id: eid, name, recordType: 'strength', tags: [{ type: 'mainMuscle', name: muscle }, { type: 'equipment', name: equipment }] }, stats };
  });
  const rpe = deload ? 6 : 7 + Math.round(rand() * 2);
  writeFileSync(join(HOME, 'cache', 'workouts', `${wid}.json`), JSON.stringify({ id: wid, name: `/ ${title}`, date, status: 'tracked', type: 'workoutRegular', trackingStats: { rpe }, exercises }));
  calendar.push({ id: wid, date, type: 'workoutRegular', status: 'tracked', title: `/ ${title}`, rpe });
}
writeFileSync(join(HOME, 'cache', 'calendar.json'), JSON.stringify(calendar));
writeFileSync(join(HOME, 'config.json'), JSON.stringify({ email: 'demo@example.com', subdomain: 'demo', userID: 1, firstDate: ymd(start), lastSync: ymd(today) }, null, 2));
console.log(`Demo data: ${calendar.filter(c => c.status === 'tracked' && c.type === 'workoutRegular').length} workouts → ${HOME}`);
