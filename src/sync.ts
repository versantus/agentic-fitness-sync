import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR, WORKOUT_DIR, ensureDirs, saveConfig, type Config } from './config.js';
import type { TrainerizeClient } from './api.js';

const CALENDAR_FILE = join(CACHE_DIR, 'calendar.json');
const WINDOW_DAYS = 360;        // API rejects ranges of a year or more
const RESYNC_DAYS = 30;          // re-fetch recent workouts in case they were edited
const BATCH = 10;
const EARLIEST = '2012-01-01';

export interface CalendarItem {
  id: number;
  date: string;
  type: string;      // workoutRegular | cardio | bodyStat | habit | nutrition | photo | ...
  status: string;    // tracked | scheduled
  title: string;
  workoutID?: number;
  rpe?: number | null;
}

// Fields we drop from cached workouts: long coaching text and media links.
const HEAVY = new Set(['description', 'media', 'videoUrl', 'videoMobileUrl', 'videoType', 'videoStatus', 'instructions', 'numPhotos']);

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

export function loadCalendar(): CalendarItem[] {
  return existsSync(CALENDAR_FILE) ? JSON.parse(readFileSync(CALENDAR_FILE, 'utf8')) : [];
}

export function loadWorkouts(): any[] {
  if (!existsSync(WORKOUT_DIR)) return [];
  return readdirSync(WORKOUT_DIR).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(WORKOUT_DIR, f), 'utf8')));
}

async function fetchWindow(client: TrainerizeClient, start: string, end: string): Promise<CalendarItem[]> {
  const res = await client.post('calendar/getList', { userID: client.userID, startDate: start, endDate: end, unitWeight: 'kg' });
  const out: CalendarItem[] = [];
  for (const day of res.calendar ?? []) for (const i of day.items ?? []) {
    out.push({ id: i.id, date: day.date, type: i.type, status: i.status, title: i.title ?? '', workoutID: i.detail?.workoutID, rpe: i.detail?.rpe ?? null });
  }
  return out;
}

export interface SyncOptions { full?: boolean; log?: (msg: string) => void }

export async function sync(client: TrainerizeClient, cfg: Config, opts: SyncOptions = {}): Promise<{ calendarItems: number; fetched: number; workouts: number }> {
  const log = opts.log ?? (() => {});
  ensureDirs();
  const today = ymd(new Date());
  const horizon = addDays(today, 28); // include upcoming scheduled sessions
  let calendar = opts.full ? [] : loadCalendar();
  const refetch = new Set<number>();

  const replaceWindow = (start: string, end: string, items: CalendarItem[]) => {
    calendar = calendar.filter(c => c.date < start || c.date > end).concat(items);
    for (const i of items) if (i.type === 'workoutRegular' && i.status === 'tracked') refetch.add(i.id);
  };

  if (opts.full || !cfg.lastSync) {
    // Walk backwards until we hit two consecutive empty windows before the earliest activity.
    let end = horizon, empty = 0, first: string | undefined;
    while (end > EARLIEST && empty < 2) {
      const start = addDays(end, -(WINDOW_DAYS - 1));
      log(`calendar ${start} → ${end}`);
      const items = await fetchWindow(client, start, end);
      replaceWindow(start, end, items);
      const dates = items.map(i => i.date).sort();
      // Before any activity is found, keep walking back (to EARLIEST) so a long gap doesn't end the scan.
      if (dates.length) { first = dates[0]; empty = 0; } else if (first) empty++;
      end = addDays(start, -1);
    }
    cfg.firstDate = first;
  } else {
    let start = addDays(cfg.lastSync, -RESYNC_DAYS);
    while (start <= horizon) {
      const end = [addDays(start, WINDOW_DAYS - 1), horizon].sort()[0];
      log(`calendar ${start} → ${end}`);
      replaceWindow(start, end, await fetchWindow(client, start, end));
      start = addDays(end, 1);
    }
  }

  calendar.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  writeFileSync(CALENDAR_FILE, JSON.stringify(calendar));

  // Only download workouts we don't have, plus anything in the re-sync window.
  const cutoff = addDays(today, -RESYNC_DAYS);
  const todo = calendar.filter(c => c.type === 'workoutRegular' && c.status === 'tracked' && refetch.has(c.id)
    && (!existsSync(join(WORKOUT_DIR, `${c.id}.json`)) || c.date >= cutoff)).map(c => c.id);

  let fetched = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const ids = todo.slice(i, i + BATCH);
    log(`workouts ${i + 1}–${i + ids.length} of ${todo.length}`);
    const res = await client.post('dailyWorkout/get', { ids, unitWeight: 'kg' });
    for (const w of res.dailyWorkouts ?? []) {
      if (!Number.isSafeInteger(w?.id) || w.id <= 0) continue; // ids become filenames
      const slim = JSON.parse(JSON.stringify(w, (k, v) => (HEAVY.has(k) ? undefined : v)));
      writeFileSync(join(WORKOUT_DIR, `${w.id}.json`), JSON.stringify(slim));
      fetched++;
    }
  }

  cfg.lastSync = today;
  saveConfig(cfg);
  return { calendarItems: calendar.length, fetched, workouts: readdirSync(WORKOUT_DIR).length };
}
