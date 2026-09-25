import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSummary, e1rm, toSets, weekStart } from './analytics.js';

const workout = (id: number, date: string, sets: [number, number][], name = 'Back Squat') => ({
  id, date, name: '/ Squat', status: 'tracked',
  exercises: [
    { def: { id: 1, name, recordType: 'strength', tags: [{ type: 'mainMuscle', name: 'quads' }] }, stats: sets.map(([reps, weight], i) => ({ setID: i + 1, reps, weight })) },
    { def: { id: 99, name: 'Rest', recordType: 'rest', tags: [] }, stats: [{ setID: 1, reps: null, weight: null }] },
  ],
});

test('e1rm uses Epley and ignores high-rep or empty sets', () => {
  assert.equal(e1rm(100, 1), 100);
  assert.equal(Math.round(e1rm(100, 5)! * 10) / 10, 116.7);
  assert.equal(e1rm(100, 12), null);
  assert.equal(e1rm(0, 5), null);
});

test('weekStart is Monday', () => {
  assert.equal(weekStart('2026-09-25'), '2026-09-21'); // Friday
  assert.equal(weekStart('2026-09-21'), '2026-09-21');
  assert.equal(weekStart('2026-09-27'), '2026-09-21'); // Sunday
});

test('toSets drops rest blocks and cleans names', () => {
  const rows = toSets([workout(1, '2026-09-01', [[5, 100]])]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].workout, 'Squat');
  assert.equal(rows[0].muscle, 'quads');
});

test('PRs fire only when a previous best is beaten', () => {
  const sets = toSets([
    workout(1, '2026-09-01', [[5, 100], [5, 100]]),
    workout(2, '2026-09-08', [[5, 95]]),
    workout(3, '2026-09-15', [[5, 105]]),
  ]);
  const s = buildSummary(sets, [], '2026-09-20');
  assert.deepEqual(s.prs.map(p => [p.date, p.kind]), [['2026-09-15', 'e1RM'], ['2026-09-15', 'weight']]);
  assert.equal(s.exercises[0].bestWeight, 105);
  assert.equal(s.weekly.length, 3);
  assert.equal(s.weekly[0].muscles.quads.sets, 2);
});

test('streak counts consecutive weeks with a strength workout', () => {
  const cal = ['2026-09-01', '2026-09-08', '2026-09-15'].map((date, i) => ({ id: i, date, type: 'workoutRegular', status: 'tracked', title: '' }));
  const s = buildSummary([], cal, '2026-09-20');
  assert.equal(s.consistency.currentStreakWeeks, 3);
});
