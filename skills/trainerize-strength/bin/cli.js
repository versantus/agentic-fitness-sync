#!/usr/bin/env node
import './env.js';
import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { execFile } from 'node:child_process';
import { login, TrainerizeClient } from './api.js';
import { clearToken, deletePassword, HOME, loadConfig, requireConfig, saveConfig, savePassword, saveToken } from './config.js';
import { loadCalendar, loadWorkouts, sync } from './sync.js';
import { buildSummary, toSets } from './analytics.js';
import { toCsv } from './export.js';
import { serve } from './server.js';
const HELP = `trainerize — unofficial export & dashboard for your own ABC Trainerize data

Usage:
  trainerize login [--email you@x.com] [--subdomain yourcoach]   sign in (password stored in macOS Keychain)
  trainerize sync [--full]                                        download new workouts to ~/.trainerize
  trainerize status                                               show account and cache status
  trainerize stats [--exercise squat] [--weeks 12] [--top 10]     JSON summary (for scripts / Claude)
  trainerize export [--format csv|json] [--out file]              one row per logged set
  trainerize serve [--port 4477] [--no-open]                      local dashboard
  trainerize logout                                               remove stored credentials

Not affiliated with ABC Trainerize. Reads only your own account.`;
const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
        email: { type: 'string' }, subdomain: { type: 'string' },
        full: { type: 'boolean' }, format: { type: 'string' }, out: { type: 'string' },
        exercise: { type: 'string' }, weeks: { type: 'string' }, top: { type: 'string' },
        port: { type: 'string' }, 'no-open': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    },
});
const err = (m) => process.stderr.write(m + '\n');
function ask(question, hidden = false) {
    return new Promise(resolve => {
        const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        if (hidden) {
            // Suppress echo while the password is typed.
            rl._writeToOutput = (s) => { if (s.includes(question))
                process.stdout.write(s); };
        }
        rl.question(question, answer => { rl.close(); if (hidden)
            process.stdout.write('\n'); resolve(answer.trim()); });
    });
}
/** Accept "hallpt", "hallpt.trainerize.com" or a full URL. */
const parseSubdomain = (s) => s.replace(/^https?:\/\//, '').split('/')[0].replace(/\.trainerize\.com$/i, '');
async function cmdLogin() {
    const prev = loadConfig();
    const email = values.email ?? process.env.TRAINERIZE_EMAIL ?? prev?.email ?? await ask('Email: ');
    const subdomain = parseSubdomain(values.subdomain ?? process.env.TRAINERIZE_URL ?? prev?.subdomain ?? await ask('Your Trainerize web address (e.g. yourcoach.trainerize.com): '));
    const password = process.env.TRAINERIZE_PASSWORD ?? await ask('Password (not shown): ', true);
    const r = await login(email, password, subdomain);
    saveToken({ accessToken: r.accessToken, expiresAt: r.expiresAt });
    saveConfig({ ...(prev?.email === email ? prev : {}), email, subdomain, userID: r.userID });
    const stored = savePassword(email, password);
    err(`✓ Logged in as user ${r.userID} on ${subdomain}.trainerize.com`);
    err(stored ? '  Password saved to your macOS Keychain (service "agentic-fitness-sync") for automatic re-login.'
        : '  Password not stored (non-macOS). Set TRAINERIZE_PASSWORD or re-run login when the session expires.');
    err('Next: trainerize sync');
}
async function cmdSync() {
    const cfg = requireConfig();
    const full = values.full || !cfg.lastSync;
    err(full ? 'Full sync — first run fetches your whole history, give it a minute…' : `Syncing changes since ${cfg.lastSync}…`);
    const r = await sync(new TrainerizeClient(cfg), cfg, { full, log: m => err('  ' + m) });
    err(`✓ ${r.fetched} workouts downloaded · ${r.workouts} cached · ${r.calendarItems} calendar items`);
}
function summary() {
    return buildSummary(toSets(loadWorkouts()), loadCalendar());
}
function cmdStats() {
    const s = summary();
    const weeks = Number(values.weeks ?? 12), top = Number(values.top ?? 10);
    const q = values.exercise?.toLowerCase();
    const pick = q ? s.exercises.filter(e => e.name.toLowerCase().includes(q)) : s.exercises.slice(0, top);
    const since = new Date(Date.now() - weeks * 7 * 864e5).toISOString().slice(0, 10);
    const out = {
        range: s.range, totals: s.totals,
        consistency: { ...s.consistency, trackedDays: undefined },
        exercises: pick.map(e => ({
            id: e.id, name: e.name, muscle: e.muscle, equipment: e.equipment,
            bestE1rmKg: e.bestE1rm, bestWeightKg: e.bestWeight, firstDate: e.firstDate, lastDate: e.lastDate,
            totalSessions: e.sessions.length, repMaxes: e.repMaxes,
            recent: e.sessions.filter(x => x.date >= since).map(({ date, e1rm, bestSet, volume, sets }) => ({ date, e1rm, bestSet, volume, sets })),
        })),
        recentPRs: s.prs.filter(p => p.date >= since).slice(0, 25),
        weekly: s.weekly.filter(w => w.week >= since),
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}
function cmdExport() {
    const rows = toSets(loadWorkouts());
    const fmt = values.format ?? (values.out?.endsWith('.json') ? 'json' : 'csv');
    const body = fmt === 'json' ? JSON.stringify(rows, null, 2) : toCsv(rows);
    if (values.out) {
        writeFileSync(values.out, body);
        err(`✓ ${rows.length} sets → ${values.out}`);
    }
    else
        process.stdout.write(body);
}
function cmdStatus() {
    const cfg = loadConfig();
    if (!cfg)
        return err('Not logged in. Run `trainerize login`.');
    const cal = loadCalendar();
    err(`Account:   user ${cfg.userID} @ ${cfg.subdomain}.trainerize.com (${cfg.email})`);
    err(`Data dir:  ${HOME}`);
    err(`Last sync: ${cfg.lastSync ?? 'never'}${cfg.firstDate ? ` · history from ${cfg.firstDate}` : ''}`);
    err(`Cached:    ${loadWorkouts().length} workouts · ${cal.length} calendar items`);
}
async function cmdServe() {
    const { url } = await serve(Number(values.port ?? 4477));
    err(`Dashboard running at ${url}  (Ctrl+C to stop)`);
    if (!values['no-open'])
        execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], () => { });
}
function cmdLogout() {
    const cfg = loadConfig();
    if (cfg)
        deletePassword(cfg.email);
    clearToken();
    err('✓ Stored password and session removed. Cached workouts remain in ' + HOME);
}
const commands = { login: cmdLogin, sync: cmdSync, stats: cmdStats, export: cmdExport, status: cmdStatus, serve: cmdServe, logout: cmdLogout };
const cmd = positionals[0];
if (!cmd || values.help || !commands[cmd]) {
    console.log(HELP);
    process.exit(cmd && !values.help ? 1 : 0);
}
Promise.resolve(commands[cmd]()).catch(e => { err('✗ ' + e.message); process.exit(1); });
