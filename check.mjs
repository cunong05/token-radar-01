// Local gate check for the token-radar entry. Usage: node check.mjs <outDir> <snapshot.json>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
const snapPath = process.argv[3];
let fails = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};

const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8'));
const rows = board.rows;
ok('board_file rows 100..4000', rows.length >= 100 && rows.length <= 4000, `${rows.length} rows`);
const slugs = new Set(snap.protocols.map((p) => p.slug));
ok('board slugs all in snapshot', rows.every((r) => slugs.has(r.slug)));
const names = new Set(rows.map((r) => r.slug));
ok('board slugs unique', names.size === rows.length);
const missing = snap.watchlist.filter((s) => !names.has(s));
ok('coverage watchlist 40/40', missing.length === 0, missing.join(',') || 'all present');
const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
ok('sorted_by_value ranks 1..N', ranks.every((v, i) => v === i + 1));
ok('sorted_by_value implied non-increasing', rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd));
ok('implied values not all equal', !(rows.length >= 2 && rows[0].implied_value_usd === rows[rows.length - 1].implied_value_usd),
  `$${rows[0].implied_value_usd} .. $${rows[rows.length - 1].implied_value_usd}`);
ok('implied positive whole', rows.every((r) => Number.isSafeInteger(r.implied_value_usd) && r.implied_value_usd > 0));
const badSteps = rows.filter((r) => !(r.farm_steps.length >= 3 && r.farm_steps.length <= 12
  && r.farm_steps.every((s) => { const t = s.trim(); return t.length >= 20 && t.length <= 600; })));
ok('farm_steps 3..12 x 20..600 chars', badSteps.length === 0, badSteps.slice(0, 3).map((r) => r.slug).join(','));
const size = statSync(join(out, 'board.json')).size;
ok('board.json <= 8 MiB', size <= 8 * 1024 * 1024, `${size} bytes`);

// dashboard
const dash = readdirSync(join(out, 'dashboard'));
ok('dashboard has index.html', dash.includes('index.html'));
ok('dashboard has .css', dash.some((f) => f.endsWith('.css')));
ok('dashboard has .js', dash.some((f) => f.endsWith('.js')));
const dashFiles = dash.map((f) => ({ f, s: statSync(join(out, 'dashboard', f)).size }));
ok('dashboard <= 400 files / <= 4 MiB', dash.length <= 400 && dashFiles.reduce((n, x) => n + x.s, 0) <= 4 * 1024 * 1024,
  `${dash.length} files, ${dashFiles.reduce((n, x) => n + x.s, 0)} bytes`);
const netRe = /(?:href|src|action)\s*=\s*["']https?:\/\/|@import\s+["']https?:\/\/|from\s+["']https?:\/\/|import\s*\(\s*["']https?:\/\/|require\s*\(\s*["']https?:\/\//;
const badNet = [];
for (const { f } of dashFiles) {
  const txt = readFileSync(join(out, 'dashboard', f), 'utf8');
  if (netRe.test(txt)) badNet.push(f);
  if (/https?:\/\//.test(txt) && (f.endsWith('.css') || f.endsWith('.js'))) badNet.push(f + ' (url literal)');
}
ok('dashboard no network addresses', badNet.length === 0, badNet.join(','));
const totalSrc = dashFiles.reduce((n, x) => n + x.s, 0);
ok('dashboard source < 64 KiB', totalSrc < 65536, `${totalSrc} bytes`);

// screenshots
const shots = readdirSync(join(out, 'screenshots')).filter((f) => !f.startsWith('.'));
ok('screenshots 3..4', shots.length >= 3 && shots.length <= 4, `${shots.length}: ${shots.join(', ')}`);
for (const f of shots) {
  const b = readFileSync(join(out, 'screenshots', f));
  const isPng = b[0] === 0x89 && b[1] === 0x50;
  const isJpg = b[0] === 0xff && b[1] === 0xd8;
  let dims = '';
  if (isPng) dims = `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
  ok(`screenshot ${f} PNG/JPEG <= 512 KiB ${dims}`, (isPng || isJpg) && b.length <= 524288, `${b.length} bytes`);
}

// dossier byte-identical
const { buildDossier } = await import('./vendor/makefun-board.ts');
const rebuilt = buildDossier(out, { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 }, dashboard: { max_files: 400, max_bytes: 4194304 } });
const onDisk = readFileSync(join(out, 'dossier.json'));
ok('dossier_matches byte-identical', Buffer.compare(Buffer.from(rebuilt), onDisk) === 0, `${onDisk.length} bytes`);
ok('dossier <= 1.5 MiB', onDisk.length <= 1572864);

console.log(fails === 0 ? 'ALL GATE CHECKS PASS' : `${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
