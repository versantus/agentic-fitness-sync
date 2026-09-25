import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { toCsv } from './export.js';
import { serve } from './server.js';

test('CSV neutralises spreadsheet formulas', () => {
  const csv = toCsv([{ date: '2026-09-01', workout: '=HYPERLINK("http://x")', exercise: '+cmd', muscle: '-1', equipment: '@SUM(A1)', set: 1, reps: -5 as any, weightKg: 10, rpe: null, workoutId: 1, exerciseId: 2 }]);
  const row = csv.trim().split('\n')[1];
  assert.match(row, /^2026-09-01,"'=HYPERLINK\(""http:\/\/x""\)",'\+cmd,'-1,'@SUM\(A1\),1,-5,10,/);
});

const hit = (port: number, path: string, method: string, headers: Record<string, string>) =>
  new Promise<number>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, res => { res.resume(); resolve(res.statusCode!); });
    req.on('error', reject); req.end();
  });

test('dashboard server rejects foreign Host, foreign Origin and header-less sync', async () => {
  const port = 45000 + Math.floor(Math.random() * 1000);
  const { server } = await serve(port);
  const host = `127.0.0.1:${port}`;
  assert.equal(await hit(port, '/', 'GET', { Host: host }), 200);
  assert.equal(await hit(port, '/api/summary', 'GET', { Host: `evil.example:${port}` }), 403);   // DNS rebinding
  assert.equal(await hit(port, '/api/sync', 'POST', { Host: host, Origin: 'https://evil.example' }), 403); // CSRF
  assert.equal(await hit(port, '/api/sync', 'POST', { Host: host }), 403);                       // no custom header
  server.close();
});
