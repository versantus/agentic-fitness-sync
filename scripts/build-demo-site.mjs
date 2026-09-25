#!/usr/bin/env node
// Builds a fully static, shareable demo of the dashboard: generated demo data is baked into
// site/index.html, so it needs no server, no Trainerize account and no API.
//
//   npm run build && node scripts/build-demo-site.mjs     → site/index.html
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const home = mkdtempSync(join(tmpdir(), 'tz-demo-'));
execFileSync(process.execPath, [join(root, 'scripts', 'demo-data.mjs')], { env: { ...process.env, TRAINERIZE_HOME: home }, stdio: 'inherit' });

process.env.TRAINERIZE_HOME = home; // must be set before config.js is loaded
const bin = join(root, 'skills', 'trainerize-strength', 'bin');
const { buildSummary, toSets } = await import(join(bin, 'analytics.js'));
const { loadCalendar, loadWorkouts } = await import(join(bin, 'sync.js'));
const summary = { ...buildSummary(toSets(loadWorkouts()), loadCalendar()), lastSync: new Date().toISOString().slice(0, 10) };
rmSync(home, { recursive: true, force: true });

// `</` is escaped so no string in the data can close the <script> element.
const payload = JSON.stringify(summary).replace(/</g, '\\u003c');
const html = readFileSync(join(root, 'skills', 'trainerize-strength', 'dashboard', 'index.html'), 'utf8')
  .replace('<title>Strength Dashboard</title>', '<title>Strength Dashboard · Demo</title>\n<meta name="description" content="Demo of agentic-fitness-sync: a strength training dashboard for your own Trainerize data.">')
  .replace('<script>\nconst $ =', `<script>window.DASHBOARD_DEMO = true; window.DASHBOARD_DATA = ${payload};</script>\n<script>\nconst $ =`);
if (!html.includes('window.DASHBOARD_DEMO')) throw new Error('Could not inject demo data: dashboard script tag not found');

const out = join(root, 'site');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), html);
writeFileSync(join(out, '_headers'), `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
`);
writeFileSync(join(out, 'robots.txt'), 'User-agent: *\nAllow: /\n');
console.log(`Demo site → ${out}/index.html (${Math.round(html.length / 1024)} KB)`);
