const cleanName = (s) => (s ?? '').replace(/^\s*\/\s*/, '').trim();
/** Flatten cached dailyWorkouts into one row per logged set (rest blocks dropped). */
export function toSets(workouts) {
    const rows = [];
    for (const w of workouts) {
        if (w.status !== 'tracked')
            continue;
        for (const ex of w.exercises ?? []) {
            const def = ex.def ?? {};
            if (def.recordType === 'rest')
                continue;
            const tag = (t) => (def.tags ?? []).find((x) => x.type === t)?.name ?? '';
            for (const s of ex.stats ?? []) {
                if (s.reps == null && s.weight == null)
                    continue;
                rows.push({
                    date: w.date, workoutId: w.id, workout: cleanName(w.name),
                    exerciseId: def.id, exercise: cleanName(def.name),
                    muscle: tag('mainMuscle') || 'other', equipment: tag('equipment'),
                    set: s.setID, reps: s.reps ?? null, weightKg: s.weight ?? null,
                    rpe: w.trackingStats?.rpe ?? null,
                });
            }
        }
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.workoutId - b.workoutId || a.set - b.set);
}
/** Epley estimate. Sets above 10 reps are too noisy to project a max from. */
export function e1rm(weight, reps) {
    if (!weight || !reps || weight <= 0 || reps <= 0 || reps > 10)
        return null;
    return reps === 1 ? weight : weight * (1 + reps / 30);
}
export const weekStart = (date) => {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
};
const r1 = (n) => Math.round(n * 10) / 10;
const REP_TARGETS = [1, 2, 3, 5, 8, 10, 12, 15];
export function repMaxes(rows) {
    const out = [];
    for (const n of REP_TARGETS) {
        let best = null;
        for (const r of rows) {
            if (!r.weightKg || (r.reps ?? 0) < n)
                continue;
            if (!best || r.weightKg > best.weightKg || (r.weightKg === best.weightKg && (r.reps ?? 0) > (best.reps ?? 0)))
                best = r;
        }
        if (best)
            out.push({ reps: n, weightKg: best.weightKg, actualReps: best.reps, date: best.date });
    }
    return out;
}
export function buildSummary(sets, calendar, today = new Date().toISOString().slice(0, 10)) {
    // ---- per-exercise sessions -------------------------------------------
    const byExercise = new Map();
    for (const s of sets)
        (byExercise.get(s.exerciseId) ?? byExercise.set(s.exerciseId, []).get(s.exerciseId)).push(s);
    const yearAgo = new Date(Date.parse(today) - 365 * 864e5).toISOString().slice(0, 10);
    const exercises = [];
    const prs = [];
    for (const [id, rows] of byExercise) {
        const byDay = new Map();
        for (const r of rows)
            (byDay.get(r.date) ?? byDay.set(r.date, []).get(r.date)).push(r);
        const sessions = [];
        let bestE = 0, bestW = 0;
        for (const [date, day] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
            let top = null, topE = 0, heaviest = null;
            for (const r of day) {
                const e = e1rm(r.weightKg, r.reps);
                if (e && e > topE) {
                    topE = e;
                    top = r;
                }
                if ((r.weightKg ?? 0) > (heaviest?.weightKg ?? 0))
                    heaviest = r;
            }
            const volume = day.reduce((a, r) => a + (r.weightKg ?? 0) * (r.reps ?? 0), 0);
            const best = top ?? heaviest;
            sessions.push({
                date, e1rm: topE ? r1(topE) : null,
                topWeight: heaviest?.weightKg ?? 0, topReps: heaviest?.reps ?? 0,
                bestSet: best && best.weightKg ? `${best.weightKg}kg × ${best.reps ?? '?'}` : `${Math.max(...day.map(r => r.reps ?? 0))} reps`,
                volume: Math.round(volume), sets: day.length,
            });
            const name = rows[0].exercise;
            if (topE && bestE && topE > bestE * 1.001)
                prs.push({ date, exerciseId: id, exercise: name, kind: 'e1RM', value: r1(topE), previous: r1(bestE), set: `${top.weightKg}kg × ${top.reps}` });
            if (heaviest?.weightKg && bestW && heaviest.weightKg > bestW)
                prs.push({ date, exerciseId: id, exercise: name, kind: 'weight', value: heaviest.weightKg, previous: bestW, set: `${heaviest.weightKg}kg × ${heaviest.reps}` });
            bestE = Math.max(bestE, topE);
            bestW = Math.max(bestW, heaviest?.weightKg ?? 0);
        }
        exercises.push({
            id, name: rows[0].exercise, muscle: rows[0].muscle, equipment: rows[0].equipment, sessions,
            bestE1rm: bestE ? r1(bestE) : null, bestWeight: bestW,
            firstDate: sessions[0].date, lastDate: sessions.at(-1).date,
            totalSets: rows.length, totalVolume: Math.round(rows.reduce((a, r) => a + (r.weightKg ?? 0) * (r.reps ?? 0), 0)),
            repMaxes: repMaxes(rows),
            recentSessions: sessions.filter(s => s.date >= yearAgo && s.topWeight > 0).length,
        });
    }
    exercises.sort((a, b) => b.recentSessions - a.recentSessions || b.sessions.length - a.sessions.length);
    prs.sort((a, b) => b.date.localeCompare(a.date));
    // ---- weekly volume by muscle -----------------------------------------
    const weeks = new Map();
    for (const s of sets) {
        const wk = weekStart(s.date);
        const w = weeks.get(wk) ?? weeks.set(wk, { week: wk, tonnage: 0, sets: 0, workouts: new Set(), muscles: {} }).get(wk);
        const t = (s.weightKg ?? 0) * (s.reps ?? 0);
        w.tonnage += t;
        w.sets++;
        w.workouts.add(s.workoutId);
        const m = (w.muscles[s.muscle] ??= { sets: 0, tonnage: 0 });
        m.sets++;
        m.tonnage += t;
    }
    const weekly = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)).map(w => ({
        week: w.week, tonnage: Math.round(w.tonnage), sets: w.sets, workouts: w.workouts.size,
        muscles: Object.fromEntries(Object.entries(w.muscles).map(([k, v]) => [k, { sets: v.sets, tonnage: Math.round(v.tonnage) }])),
    }));
    // ---- consistency -----------------------------------------------------
    const trackedDays = {};
    for (const c of calendar)
        if (c.status === 'tracked' && (c.type === 'workoutRegular' || c.type === 'cardio'))
            trackedDays[c.date] = (trackedDays[c.date] ?? 0) + 1;
    const strengthWeeks = new Set(calendar.filter(c => c.type === 'workoutRegular' && c.status === 'tracked').map(c => weekStart(c.date)));
    const streakFrom = (start) => {
        let n = 0;
        const d = new Date(start + 'T00:00:00Z');
        while (strengthWeeks.has(d.toISOString().slice(0, 10))) {
            n++;
            d.setUTCDate(d.getUTCDate() - 7);
        }
        return n;
    };
    const thisWeek = weekStart(today);
    const lastWeek = weekStart(new Date(Date.parse(thisWeek) - 7 * 864e5).toISOString().slice(0, 10));
    const currentStreak = strengthWeeks.has(thisWeek) ? streakFrom(thisWeek) : streakFrom(lastWeek);
    let longestStreak = 0;
    for (const w of strengthWeeks)
        longestStreak = Math.max(longestStreak, streakFrom(w));
    const twelveWeeksAgo = new Date(Date.parse(thisWeek) - 12 * 7 * 864e5).toISOString().slice(0, 10);
    const recent = calendar.filter(c => c.type === 'workoutRegular' && c.date >= twelveWeeksAgo && c.date < today);
    const done = recent.filter(c => c.status === 'tracked').length;
    const missed = recent.filter(c => c.status === 'scheduled').length;
    const upcoming = calendar.filter(c => c.type === 'workoutRegular' && c.status === 'scheduled' && c.date >= today).slice(0, 5)
        .map(c => ({ date: c.date, title: cleanName(c.title) }));
    const totalWorkouts = new Set(sets.map(s => s.workoutId)).size;
    const monthAgo = new Date(Date.parse(today) - 30 * 864e5).toISOString().slice(0, 10);
    return {
        generatedAt: new Date().toISOString(),
        range: { first: sets[0]?.date ?? null, last: sets.at(-1)?.date ?? null },
        totals: {
            workouts: totalWorkouts,
            sets: sets.length,
            tonnageKg: Math.round(sets.reduce((a, s) => a + (s.weightKg ?? 0) * (s.reps ?? 0), 0)),
            prsLast30: prs.filter(p => p.date >= monthAgo).length,
            workoutsLast30: new Set(sets.filter(s => s.date >= monthAgo).map(s => s.workoutId)).size,
        },
        consistency: {
            currentStreakWeeks: currentStreak, longestStreakWeeks: longestStreak,
            last12Weeks: { completed: done, missed, adherence: done + missed ? Math.round((100 * done) / (done + missed)) : null },
            trackedDays, upcoming,
        },
        exercises, prs, weekly,
    };
}
