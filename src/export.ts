import type { SetRow } from './analytics.js';

const COLUMNS: (keyof SetRow)[] = ['date', 'workout', 'exercise', 'muscle', 'equipment', 'set', 'reps', 'weightKg', 'rpe', 'workoutId', 'exerciseId'];

const cell = (v: unknown) => {
  if (v == null) return '';
  let s = String(v);
  // Neutralise spreadsheet formulas in text (exercise names are editable by coaches).
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: SetRow[]): string {
  return [COLUMNS.join(','), ...rows.map(r => COLUMNS.map(c => cell(r[c])).join(','))].join('\n') + '\n';
}
