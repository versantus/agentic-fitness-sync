#!/usr/bin/env node
// Builds a fully static, shareable demo of the dashboard: generated demo data is baked into
// site/index.html, so it needs no server, no Trainerize account and no API.
//
//   npm run build && node scripts/build-demo-site.mjs     → site/index.html
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = (process.env.SITE_URL ?? 'https://agentic-fitness-sync-demo.netlify.app').replace(/\/$/, '');
const REPO = 'https://github.com/versantus/agentic-fitness-sync';
const TITLE = 'Strength dashboard demo · Agentic Fitness Sync';
const DESC = 'See your Trainerize lifts properly: estimated 1RM trends, rep maxes, PRs, a muscle body map and consistency. Ask Claude, ChatGPT or Grok about it. Free and open source.';
const esc = t => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'Agentic Fitness Sync demo', inLanguage: 'en-GB', publisher: { '@id': 'https://www.versantus.co.uk/#organization' } },
    { '@type': 'Organization', '@id': 'https://www.versantus.co.uk/#organization', name: 'Versantus', url: 'https://www.versantus.co.uk' },
    {
      '@type': 'SoftwareApplication', '@id': `${SITE}/#app`, name: 'Agentic Fitness Sync', description: DESC,
      url: `${SITE}/`, sameAs: REPO, applicationCategory: 'HealthApplication', applicationSubCategory: 'Strength training analytics',
      operatingSystem: 'macOS, Linux, Windows (Node.js 20.12+)', isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' }, license: `${REPO}/blob/main/LICENSE`,
      image: `${SITE}/og-image.png`, screenshot: `${SITE}/og-image.png`,
      featureList: ['Estimated 1RM trends', 'Rep-max tables', 'Personal records', 'Muscle-group body map', 'Weekly volume', 'Consistency heatmap', 'Works with Claude, ChatGPT and Grok'],
      author: { '@id': 'https://www.versantus.co.uk/#organization' }, publisher: { '@id': 'https://www.versantus.co.uk/#organization' },
    },
  ],
};
const HEAD = `<title>${esc(TITLE)}</title>
<meta name="description" content="${esc(DESC)}">
<link rel="canonical" href="${SITE}/">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Agentic Fitness Sync">
<meta property="og:locale" content="en_GB">
<meta property="og:url" content="${SITE}/">
<meta property="og:title" content="${esc(TITLE)}">
<meta property="og:description" content="${esc(DESC)}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:image:secure_url" content="${SITE}/og-image.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Strength dashboard showing summary tiles, an estimated 1RM chart and a front and back muscle body map">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(TITLE)}">
<meta name="twitter:description" content="${esc(DESC)}">
<meta name="twitter:image" content="${SITE}/og-image.png">
<meta name="twitter:image:alt" content="Strength dashboard showing summary tiles, an estimated 1RM chart and a front and back muscle body map">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`;
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
  .replace('<title>Strength Dashboard</title>', HEAD)
  .replace(/<link rel="icon" type="image\/svg\+xml" href="data:[^"]*">\n?/, '') // the demo serves real icon files instead
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
  Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; manifest-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
/site.webmanifest
  Content-Type: application/manifest+json
/og-image.png
  Cache-Control: public, max-age=86400
`);
writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url></urlset>\n`);
writeFileSync(join(out, 'site.webmanifest'), JSON.stringify({ name: 'Agentic Fitness Sync demo', short_name: 'Strength', start_url: '/', display: 'standalone', background_color: '#F4F4F4', theme_color: '#F0146E', icons: [{ src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }, { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }] }, null, 2));
for (const [from, to] of [['social-card.png', 'og-image.png'], ['apple-touch-icon.png', 'apple-touch-icon.png'], ['favicon.svg', 'favicon.svg']]) copyFileSync(join(root, 'docs', from), join(out, to));
console.log(`Demo site → ${out}/index.html (${Math.round(html.length / 1024)} KB)`);
