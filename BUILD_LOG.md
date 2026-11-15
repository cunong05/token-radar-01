# Build log — token-radar-01

## What was built (all authored in this session; starter read only for interfaces)
- `main.ts` — entrypoint: reads `--input` snapshot, builds the board, writes
  `board.json` / `data.js`, copies `dashboard/` + `screenshots/`, writes
  `dossier.json` via `vendor/makefun-board.ts` (vendored copy, as the kit directs).
- `lib/radar.ts` — value model "radar-2": implied = TVL × sectorMultiple(category,
  0.22–0.34) × growthFactor (7d change clamped −50…+150%) × ageFactor (days tracked
  with no token, max 4y credit) × chainFactor (up to +12%). No name is special-cased.
  Board = all 40 watchlist slugs + every other rankable pre-token protocol
  (wrapped/staked/bridged/exchange/versioned products excluded, same rule as the
  watchlist). 24 live-token protocols set aside in a separate "already trading"
  table showing market caps, never model values. 6 farm steps per row, each with
  cost + time, derived from category/chains/TVL/age.
- `dashboard/index.html`, `app.css`, `app.js` — dark navy/teal dashboard: stats
  strip, model explainer, search + category/chain filters + watchlist toggle +
  sortable columns, per-protocol detail view with value breakdown + farm plan,
  hash state (`#detail=`, `#cat=`, `#watch=1`). No network anywhere.
- `screenshots/1-board.png`, `2-detail.png`, `3-filtered.png` — real renders of
  the dashboard at 1440×900 via Playwright's own Chromium (installed with
  `npx playwright install chromium`; /opt/meta-chromium/chrome is blocked on
  this machine by the Hatch WebGL domain policy and was not used).
- `check.mjs` — local gate validator (board/coverage/order/farm-steps/
  dashboard/network/screenshots/dossier byte-identical).

## Local test results (2026-11-15, Node v24.22.1)
- `MAKEFUN_OUTPUT_DIR=out1 node main.ts --input <kit snapshot>` — OK:
  758 protocols, 40 watchlist, 197 rows ranked, 24 live set aside.
- Determinism: ran twice into out1/out2, `diff -r` — identical bytes.
- `node check.mjs out1 <snapshot>` — ALL GATE CHECKS PASS (22/22):
  board 197 rows; watchlist 40/40; ranks 1..197; implied non-increasing
  ($800,226,340 … $1,130,483); farm steps 6/row, 20–600 chars; dashboard
  3 files, 16,340 bytes (< 64 KiB), no network addresses; screenshots
  1440×900, 164–180 KiB each (≤ 512 KiB); dossier byte-identical, 712,674 bytes.
- Screenshots visually inspected: board, detail (#1 Steakhouse Financial with
  farm plan), filtered (Risk Curators + watchlist only, 12 of 197) all render
  correctly; no console/page errors. One app.js paren bug found by the first
  screenshot run and fixed before re-shooting.

## Sizes
- board.json 298,642 B · data.js 303,566 B · dossier.json 712,674 B
- dashboard source 16,340 B total (html 3,538 / css 4,740 / js 8,062)
- screenshots: 164,356 / 177,427 / 179,528 B

## Remaining before submit
- Nothing in the entry itself is missing. Submit is out of scope for this
  session (no commit, no GitHub repo, no submission made, per task).
- Test outputs out1/ and out2/ were removed from the working tree after the
  checks; the Playwright install lives in ~/.cache/ms-playwright (outside repo).
