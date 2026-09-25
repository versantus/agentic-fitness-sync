#!/usr/bin/env node
// Renders scripts/social-card.html → docs/social-card.png (1200×630) and the app icon
// → docs/apple-touch-icon.png (180×180) with headless Chrome. Run after changing either design.
//
//   node scripts/make-social-card.mjs            (CHROME=/path/to/chrome to override)
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(chrome)) { console.error(`Chrome not found at ${chrome}; set CHROME=/path/to/chrome`); process.exit(1); }

export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#F0146E"/><g fill="#fff"><rect x="10" y="22" width="7" height="20" rx="2.5"/><rect x="47" y="22" width="7" height="20" rx="2.5"/><rect x="17" y="26" width="5" height="12" rx="2"/><rect x="42" y="26" width="5" height="12" rx="2"/><rect x="22" y="29.5" width="20" height="5" rx="2"/></g></svg>`;

// Headless Chrome sometimes keeps running after writing the screenshot, so wait for the file and stop it.
function render(url, out, width, height) {
  const profile = mkdtempSync(join(tmpdir(), 'card-'));
  rmSync(out, { force: true });
  const p = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${width},${height}`, '--virtual-time-budget=5000', '--allow-file-access-from-files',
    `--user-data-dir=${profile}`, `--screenshot=${out}`, url], { stdio: 'ignore' });
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = setInterval(() => {
      if (existsSync(out) && statSync(out).size > 0) {
        clearInterval(tick);
        p.once('exit', () => { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); resolve(out); });
        setTimeout(() => p.kill(), 800);
      }
      else if (Date.now() - start > 60000) { clearInterval(tick); p.kill(); reject(new Error(`Timed out rendering ${url}`)); }
    }, 300);
  });
}

await render(pathToFileURL(join(root, 'scripts', 'social-card.html')).href, join(root, 'docs', 'social-card.png'), 1200, 630);
const iconPage = join(tmpdir(), 'afs-icon.html');
// iOS masks touch icons itself, so this one is a full-bleed square (no rounded corners).
writeFileSync(iconPage, `<!doctype html><style>html,body{margin:0;width:180px;height:180px;overflow:hidden}svg{display:block;width:180px;height:180px}</style>${ICON_SVG.replace('rx="14"', 'rx="0"')}`);
await render(pathToFileURL(iconPage).href, join(root, 'docs', 'apple-touch-icon.png'), 180, 180);
writeFileSync(join(root, 'docs', 'favicon.svg'), ICON_SVG);
console.log('→ docs/social-card.png, docs/apple-touch-icon.png, docs/favicon.svg');
