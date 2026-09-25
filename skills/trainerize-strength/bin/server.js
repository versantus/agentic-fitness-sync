import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildSummary, toSets } from './analytics.js';
import { loadCalendar, loadWorkouts, sync } from './sync.js';
import { TrainerizeClient } from './api.js';
import { requireConfig } from './config.js';
const DASHBOARD = join(dirname(fileURLToPath(import.meta.url)), '..', 'dashboard', 'index.html');
export function serve(port) {
    let syncing = null;
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    const server = createServer(async (req, res) => {
        // Block DNS-rebinding (foreign Host) and cross-site requests (foreign Origin).
        const origin = req.headers.origin;
        if (!allowedHosts.has(req.headers.host ?? '') || (origin && !allowedHosts.has(origin.replace(/^http:\/\//, '')))) {
            res.writeHead(403);
            return res.end('forbidden');
        }
        const send = (code, body, type = 'application/json') => {
            res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
            res.end(body);
        };
        try {
            if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
                return send(200, readFileSync(DASHBOARD, 'utf8'), 'text/html; charset=utf-8');
            }
            if (req.method === 'GET' && req.url === '/api/summary') {
                const cfg = requireConfig();
                const summary = buildSummary(toSets(loadWorkouts()), loadCalendar());
                return send(200, JSON.stringify({ ...summary, lastSync: cfg.lastSync ?? null }));
            }
            if (req.method === 'POST' && req.url === '/api/sync') {
                // A custom header can't be sent cross-site without a CORS preflight, which we never grant.
                if (req.headers['x-trainerize-dashboard'] !== '1')
                    return send(403, JSON.stringify({ error: 'forbidden' }));
                const cfg = requireConfig();
                syncing ??= sync(new TrainerizeClient(cfg), cfg).finally(() => { syncing = null; });
                return send(200, JSON.stringify(await syncing));
            }
            send(404, JSON.stringify({ error: 'not found' }));
        }
        catch (e) {
            send(500, JSON.stringify({ error: e.message }));
        }
    });
    return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${port}`, server })));
}
