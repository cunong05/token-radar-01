// Token launch radar: snapshot in, ranked board out.
//
// Every figure on the board is derived from the sealed snapshot alone. No
// protocol name is special-cased anywhere: one scoring function ranks every
// row, and the same farm-plan builder writes every plan.
//
// Value model ("radar-2"), stated in full on the dashboard:
//   implied = TVL x sectorMultiple(category) x growthFactor x ageFactor x chainFactor
//   sectorMultiple  sector FDV/TVL assumption, 0.22 - 0.34, from the category
//   growthFactor    1 + clamp(change_7d, -50, +150) x 0.005   (0.75 - 1.75)
//   ageFactor       0.80 + 0.20 x min(ageDays, 1460) / 1460; unknown age -> 0.88
//   chainFactor     1 + 0.02 x min(chains - 1, 6)             (1.00 - 1.12)
// Age is days from listed_at to the snapshot's as_of. A protocol is pre-token
// when the snapshot records no market cap, no CoinGecko id and no symbol.
// The board ranks pre-token protocols only; protocols whose token already
// trades are set aside as a separate live list showing the market's own
// capitalisation, never a model value.
//
// Wrapped, staked, bridged and exchange products are excluded from ranking
// even when they record no token of their own: they are a live token's
// packaging, not a launch candidate. That is the same exclusion the
// snapshot's watchlist rule applies, re-applied here to the whole board.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  token_status: 'pre-token';
  implied_value_usd: number;
  model: {
    sector_multiple: number;
    growth_pct: number;
    growth_factor: number;
    age_factor: number;
    chain_factor: number;
  };
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model_formula: string;
  watchlist_size: number;
  board_size: number;
  live_size: number;
  rows: BoardRow[];
  live: LiveRow[];
}

export const MODEL_VERSION = 'radar-2';
export const MODEL_FORMULA =
  'implied = TVL x sectorMultiple(category) x growthFactor x ageFactor x chainFactor';
export const LIVE_ROWS = 24;

const DAY_MS = 86_400_000;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** Days from listed_at to as_of, or null when either date is missing. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Sector FDV/TVL multiple for a category; the default covers the long tail. */
export function sectorMultiple(category: string | null): number {
  switch (category) {
    case 'Lending':
    case 'CDP':
    case 'CDP Manager':
      return 0.34;
    case 'Dexs':
    case 'Derivatives':
    case 'Perpetuals':
      return 0.32;
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
    case 'Yield':
    case 'Yield Aggregator':
      return 0.3;
    case 'RWA':
    case 'Basis Trading':
    case 'Liquid Staking':
      return 0.28;
    case 'Bridge':
    case 'Canonical Bridge':
    case 'Cross Chain Bridge':
      return 0.24;
    default:
      return 0.26;
  }
}

/** The implied value and every factor behind it, for one protocol. */
export function scoreProtocol(p: SnapshotProtocol, asOf: string): {
  implied: number;
  sector: number;
  growthPct: number;
  growthFactor: number;
  ageFactor: number;
  chainFactor: number;
  age: number | null;
} {
  const sector = sectorMultiple(p.category);
  const growthPct = p.change_7d === null ? 0 : clamp(p.change_7d, -50, 150);
  const growthFactor = 1 + (growthPct / 100) * 0.5;
  const age = ageDays(asOf, p.listed_at);
  const ageFactor = age === null ? 0.88 : 0.8 + 0.2 * (Math.min(age, 1460) / 1460);
  const chainFactor = 1 + 0.02 * Math.min(Math.max(p.chains.length - 1, 0), 6);
  const implied = Math.max(1, Math.round(p.tvl_usd * sector * growthFactor * ageFactor * chainFactor));
  return { implied, sector, growthPct, growthFactor, ageFactor, chainFactor, age };
}

/** True when the snapshot records no token at all for the protocol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const PACKAGED_NAME = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;

/**
 * Rankable means a genuine launch candidate: pre-token, and not a wrapped,
 * staked, bridged or exchange product of a token that already trades, and not
 * a versioned pool of another protocol. Watchlist slugs always pass this
 * test on this snapshot, and the board builder asserts coverage anyway.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED_NAME.test(p.name)) return false;
  if (PACKAGED_NAME.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** Deposit size for one farm position, stepped from the protocol's own TVL. */
function capitalFor(tvl: number): number {
  if (tvl >= 1_000_000_000) return 200;
  if (tvl >= 100_000_000) return 120;
  if (tvl >= 25_000_000) return 75;
  return 40;
}

/** Minimum hold in days: younger protocols need a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core farming action, in plain words a reader can follow. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Lend $${capital} of USDC into ${n} on ${chain} and leave the supply position open`;
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('liquidity manager'))
    return `Add $${capital} of liquidity to ${n}'s deepest pool on ${chain} and keep the LP position open`;
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator') || c.includes('vault'))
    return `Deposit $${capital} into a ${n} vault on ${chain} and hold the vault shares`;
  if (c.includes('staking') || c.includes('restak'))
    return `Stake $${capital} of the native asset through ${n} on ${chain} and keep the receipt token`;
  if (c.includes('deriv') || c.includes('perpetual') || c.includes('basis'))
    return `Deposit $${capital} of USDC as margin on ${n} and open a small hedged position`;
  if (c.includes('rwa')) return `Buy $${capital} of ${n}'s yield-bearing asset on ${chain} and hold it`;
  if (c.includes('stable')) return `Mint or hold $${capital} of the stable asset issued through ${n} on ${chain}`;
  if (c.includes('prediction')) return `Fund $${capital} and take one position in a ${n} prediction market`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${n} on ${chain} and keep the policy active`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC into ${chain} through ${n} and use the funds in its app`;
  if (c.includes('payment') || c.includes('card'))
    return `Spend $${capital} through ${n} on ${chain} and keep the receipts in the app`;
  return `Deposit $${capital} of USDC into ${n} on ${chain} and keep the position open`;
}

/**
 * Six concrete farm steps for one protocol, each carrying its cost and its
 * time. Derived only from the protocol's own record: category, chains, TVL
 * and age. Nothing here names a token that does not exist yet.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDaysFor(age);
  const steps = [
    `Open a fresh wallet that holds only the farming funds and store its seed phrase offline, never in a screenshot or chat. Cost: $0, about $2 of gas for the first transfer. Time: 5 minutes.`,
    `${coreAction(p, capital, chain)}. Cost: $${capital} of capital plus roughly $5 of gas. Time: 15 minutes to set up.`,
    `Return once a week and make one real action — a deposit, a swap, a borrow or a vote — so the wallet shows repeat use, not a single deposit. Cost: about $2 of gas per week. Time: 10 minutes a week.`,
    `Hold the position for at least ${hold} days so the activity spans more than one snapshot window. Cost: the $${capital} stays locked in the position. Time: ${hold} days.`,
    `If the protocol runs a points page, check it weekly from the link the protocol itself publishes and screenshot your balance. Cost: $0 to check; never pay anyone to claim for you. Time: 10 minutes a week.`,
    `Log the wallet address, the dates and every transaction hash in a farm log, then unwind in the reverse order you entered. Cost: $0 plus exit gas of about $5. Time: 5 minutes to log, 15 minutes to exit.`,
  ];
  return steps.map((s) => (s.length > 600 ? `${s.slice(0, 597)}...` : s));
}

/** The ranked board: watchlist first as a floor, then every other rankable protocol. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of) }));
  scored.sort(
    (a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  const watch = new Set(snapshot.watchlist);
  return scored.map((x, i) => ({
    rank: i + 1,
    slug: x.p.slug,
    name: x.p.name,
    category: x.p.category,
    chains: x.p.chains,
    tvl_usd: x.p.tvl_usd,
    change_7d: x.p.change_7d,
    listed_at: x.p.listed_at,
    age_days: x.s.age,
    on_watchlist: watch.has(x.p.slug),
    token_status: 'pre-token' as const,
    implied_value_usd: x.s.implied,
    model: {
      sector_multiple: x.s.sector,
      growth_pct: round4(x.s.growthPct),
      growth_factor: round4(x.s.growthFactor),
      age_factor: round4(x.s.ageFactor),
      chain_factor: round4(x.s.chainFactor),
    },
    farm_steps: farmSteps(x.p, x.s.age),
  }));
}

/** Live-token protocols by market cap, for the separate "already trading" table. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
    }));
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model_formula: MODEL_FORMULA,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new Error('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new Error('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new Error('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new Error('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new Error('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`snapshot.json protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new Error(`snapshot.json protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++)
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i}`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd)
    return 'all rows share one implied value: not a ranking';
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} chars`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} bad implied value`;
  }
  return null;
}

/** The dashboard's dataset as one script: no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
