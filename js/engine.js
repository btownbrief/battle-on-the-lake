// BATTLE ON THE LAKE — pure naval-duel rules. A Btown Games production.
//
// THE ONE NON-NEGOTIABLE: everything in this file is a pure function over a
// plain JSON-serializable state object. No DOM, no timers, no Date, no
// Math.random, no imports. The future online version will keep each player's
// board server-side so nobody can peek — that only works if every placement
// and every shot flows through these functions. The whole game must survive
// JSON.stringify → JSON.parse → resume. The only randomness (scattering a
// fleet) uses a seeded RNG whose cursor lives in the state.
//
// State shape: { seed, phase, turn, firstShooter, players, last }
//   seed         — RNG cursor; advances every time a fleet is scattered
//   phase        — 'place' (player `turn` is setting their fleet)
//                | 'battle' (player `turn` fires next) | 'over'
//   turn         — 1 | 2
//   firstShooter — who fires the opening shot once both fleets are set
//   players      — { 1: side, 2: side } where side is
//                  { fleet: { ferry: null | { row, col, dir }, … },
//                    ready: bool,
//                    shots: { 'row,col': 'hit' | 'miss' } }
//                  `shots` is what THIS player has fired at the other shore.
//   last         — null, or the defender's report on the most recent shot:
//                  { player, row, col, result: 'hit'|'miss',
//                    sunk: vesselId|null, win: bool }

export const SIZE = 10;
export const P1 = 1;
export const P2 = 2;

export const VESSELS = [
  { id: 'ferry', name: 'the Ferry', size: 5 },
  { id: 'schooner', name: 'the Schooner', size: 4 },
  { id: 'cutter', name: 'the Coast Guard Cutter', size: 3 },
  { id: 'sailboat', name: 'the Sailboat', size: 3 },
  { id: 'kayak', name: 'the Kayak', size: 2 },
];

const BY_ID = {};
for (const v of VESSELS) BY_ID[v.id] = v;

export function opponent(player) {
  return player === P1 ? P2 : P1;
}

/**
 * A fresh lake. Player 1 sets their fleet first; `firstShooter` (default
 * player 1) fires the opening shot once both fleets are down. Pass a real
 * seed (any integer) or every scattered fleet will look the same.
 */
export function createInitialState(options = {}) {
  const { seed = 1, firstShooter = P1 } = options;
  if (firstShooter !== P1 && firstShooter !== P2) {
    throw new Error(`firstShooter must be ${P1} or ${P2}.`);
  }
  const side = () => {
    const fleet = {};
    for (const v of VESSELS) fleet[v.id] = null;
    return { fleet, ready: false, shots: {} };
  };
  return {
    seed: seed | 0,
    phase: 'place',
    turn: P1,
    firstShooter,
    players: { 1: side(), 2: side() },
    last: null,
  };
}

/** The cells a vessel would cover from a placement, head first. */
export function cellsFor(vesselId, placement) {
  const vessel = BY_ID[vesselId];
  if (!vessel) throw new Error(`No vessel called "${vesselId}" on this lake.`);
  const cells = [];
  for (let i = 0; i < vessel.size; i++) {
    cells.push({
      row: placement.row + (placement.dir === 'v' ? i : 0),
      col: placement.col + (placement.dir === 'h' ? i : 0),
    });
  }
  return cells;
}

function inBounds(row, col) {
  return Number.isInteger(row) && Number.isInteger(col) &&
    row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

/**
 * Could `player` moor `vesselId` at (row, col, dir)? True when every cell is
 * on the lake and clear of the player's OTHER vessels — a vessel never
 * collides with its own current mooring, so re-placing (dragging, rotating)
 * is always judged fairly.
 */
export function canPlace(state, player, vesselId, row, col, dir) {
  if (!BY_ID[vesselId] || (dir !== 'h' && dir !== 'v')) return false;
  const cells = cellsFor(vesselId, { row, col, dir });
  if (!cells.every((c) => inBounds(c.row, c.col))) return false;
  const fleet = state.players[player].fleet;
  const taken = new Set();
  for (const v of VESSELS) {
    if (v.id === vesselId || !fleet[v.id]) continue;
    for (const c of cellsFor(v.id, fleet[v.id])) taken.add(`${c.row},${c.col}`);
  }
  return cells.every((c) => !taken.has(`${c.row},${c.col}`));
}

/** True once every vessel in `player`'s fleet has a mooring. */
export function allPlaced(state, player) {
  return VESSELS.every((v) => state.players[player].fleet[v.id] !== null);
}

/** The vessel of `player`'s occupying (row, col), or null. */
export function vesselAt(state, player, row, col) {
  const fleet = state.players[player].fleet;
  for (const v of VESSELS) {
    if (!fleet[v.id]) continue;
    if (cellsFor(v.id, fleet[v.id]).some((c) => c.row === row && c.col === col)) {
      return v.id;
    }
  }
  return null;
}

/** Has `attacker` hit every cell of the defender's `vesselId`? */
export function isSunk(state, attacker, vesselId) {
  const placement = state.players[opponent(attacker)].fleet[vesselId];
  if (!placement) return false;
  const shots = state.players[attacker].shots;
  return cellsFor(vesselId, placement).every((c) => shots[`${c.row},${c.col}`] === 'hit');
}

/** Has `attacker` sunk the defender's entire fleet? */
export function fleetSunk(state, attacker) {
  return VESSELS.every((v) => isSunk(state, attacker, v.id));
}

/**
 * What `shooter` knows about a cell of the enemy's waters:
 * null (never fired there) | 'miss' | 'hit' | 'sunk' (a hit on a vessel
 * that has since gone down). This is the bot's — and the UI's — whole view
 * of the enemy board.
 */
export function shotResult(state, shooter, row, col) {
  const result = state.players[shooter].shots[`${row},${col}`];
  if (result !== 'hit') return result ?? null;
  const vessel = vesselAt(state, opponent(shooter), row, col);
  return vessel && isSunk(state, shooter, vessel) ? 'sunk' : 'hit';
}

// Mulberry32, one deterministic step: seed in, [0..1) value and new seed out.
export function nextRandom(seed) {
  const next = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(next ^ (next >>> 15), 1 | next);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, next];
}

/**
 * Every legal move right now. During placement: one { type: 'place' } per
 * spot the current player's UNPLACED vessels could take, plus
 * { type: 'scatter' } and — once the whole fleet is down — { type: 'ready' }.
 * (applyMove also accepts re-placing an already-moored vessel; enumerating
 * those here would triple the list for no caller's benefit.) During battle:
 * one { type: 'fire' } per cell the current player has not shot. Empty once
 * the game is over.
 */
export function legalMoves(state) {
  if (state.phase === 'over') return [];
  const moves = [];
  if (state.phase === 'place') {
    const player = state.turn;
    for (const v of VESSELS) {
      if (state.players[player].fleet[v.id]) continue;
      for (const dir of ['h', 'v']) {
        for (let row = 0; row < SIZE; row++) {
          for (let col = 0; col < SIZE; col++) {
            if (canPlace(state, player, v.id, row, col, dir)) {
              moves.push({ type: 'place', vessel: v.id, row, col, dir });
            }
          }
        }
      }
    }
    moves.push({ type: 'scatter' });
    if (allPlaced(state, player)) moves.push({ type: 'ready' });
    return moves;
  }
  // battle
  const shots = state.players[state.turn].shots;
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (!shots[`${row},${col}`]) moves.push({ type: 'fire', row, col });
    }
  }
  return moves;
}

/**
 * Apply one move for the current player and return a NEW state — the input
 * is never mutated. Throws on anything illegal. Moves:
 *   { type: 'place', vessel, row, col, dir } — moor (or re-moor) a vessel
 *   { type: 'scatter' }                      — seeded random fleet, all five
 *   { type: 'ready' }                        — lock the fleet in
 *   { type: 'fire', row, col }               — one shot at the other shore
 */
export function applyMove(state, move) {
  if (!move || typeof move.type !== 'string') {
    throw new Error('A move needs a type.');
  }
  switch (move.type) {
    case 'place': return doPlace(state, move);
    case 'scatter': return doScatter(state);
    case 'ready': return doReady(state);
    case 'fire': return doFire(state, move);
    default: throw new Error(`Unknown move type "${move.type}".`);
  }
}

/**
 * Where the game stands:
 *   { phase, over, placing, turn, winner, last }
 *   placing — who is setting their fleet (null outside 'place')
 *   turn    — who fires next (null outside 'battle')
 *   winner  — 1 | 2 once the fleet's gone, else null
 *   last    — the defender's report on the most recent shot (see state shape)
 */
export function getStatus(state) {
  return {
    phase: state.phase,
    over: state.phase === 'over',
    placing: state.phase === 'place' ? state.turn : null,
    turn: state.phase === 'battle' ? state.turn : null,
    winner: state.phase === 'over' && state.last?.win ? state.last.player : null,
    last: state.last,
  };
}

/* ---------------------------------------------------------------- internals */

function withSide(state, player, side, extra = {}) {
  return {
    ...state,
    players: { ...state.players, [player]: side },
    ...extra,
  };
}

function doPlace(state, move) {
  if (state.phase !== 'place') throw new Error('Fleets are set — no more moorings.');
  const { vessel, row, col, dir } = move;
  if (!BY_ID[vessel]) throw new Error(`No vessel called "${vessel}" on this lake.`);
  if (dir !== 'h' && dir !== 'v') throw new Error(`Direction must be 'h' or 'v', not "${dir}".`);
  const player = state.turn;
  if (!canPlace(state, player, vessel, row, col, dir)) {
    throw new Error(`Can't moor ${BY_ID[vessel].name} at (${row}, ${col}, ${dir}).`);
  }
  const side = state.players[player];
  return withSide(state, player, {
    ...side,
    fleet: { ...side.fleet, [vessel]: { row, col, dir } },
  });
}

function doScatter(state) {
  if (state.phase !== 'place') throw new Error('Fleets are set — no scattering now.');
  const player = state.turn;
  let seed = state.seed;
  const fleet = {};
  for (const v of VESSELS) fleet[v.id] = null;
  const scratch = withSide(state, player, { ...state.players[player], fleet });
  for (const v of VESSELS) {
    let placed = null;
    for (let attempt = 0; attempt < 300 && !placed; attempt++) {
      let r;
      [r, seed] = nextRandom(seed);
      const dir = r < 0.5 ? 'h' : 'v';
      [r, seed] = nextRandom(seed);
      const row = Math.floor(r * (dir === 'v' ? SIZE - v.size + 1 : SIZE));
      [r, seed] = nextRandom(seed);
      const col = Math.floor(r * (dir === 'h' ? SIZE - v.size + 1 : SIZE));
      if (canPlace(scratch, player, v.id, row, col, dir)) placed = { row, col, dir };
    }
    if (!placed) {
      // Practically unreachable on a 10×10 with this fleet, but never loop
      // forever: take the first open mooring, scanning top-left down.
      outer: for (const dir of ['h', 'v']) {
        for (let row = 0; row < SIZE; row++) {
          for (let col = 0; col < SIZE; col++) {
            if (canPlace(scratch, player, v.id, row, col, dir)) {
              placed = { row, col, dir };
              break outer;
            }
          }
        }
      }
    }
    fleet[v.id] = placed;
    scratch.players[player].fleet = { ...fleet };
  }
  const side = state.players[player];
  return withSide(state, player, { ...side, fleet }, { seed });
}

function doReady(state) {
  if (state.phase !== 'place') throw new Error('Fleets are already set.');
  const player = state.turn;
  if (!allPlaced(state, player)) {
    throw new Error('The whole fleet must be moored before you declare ready.');
  }
  const side = { ...state.players[player], ready: true };
  const other = opponent(player);
  const bothReady = state.players[other].ready;
  return withSide(state, player, side, {
    phase: bothReady ? 'battle' : 'place',
    turn: bothReady ? state.firstShooter : other,
  });
}

function doFire(state, move) {
  if (state.phase !== 'battle') throw new Error('No firing outside the battle.');
  const { row, col } = move;
  if (!inBounds(row, col)) throw new Error(`(${row}, ${col}) is not on the lake.`);
  const shooter = state.turn;
  const defender = opponent(shooter);
  const key = `${row},${col}`;
  const side = state.players[shooter];
  if (side.shots[key]) throw new Error(`Already fired at (${row}, ${col}) — no repeats.`);
  const vessel = vesselAt(state, defender, row, col);
  const result = vessel ? 'hit' : 'miss';
  const next = withSide(state, shooter, {
    ...side,
    shots: { ...side.shots, [key]: result },
  });
  const sunk = vessel && isSunk(next, shooter, vessel) ? vessel : null;
  const win = sunk !== null && fleetSunk(next, shooter);
  next.last = { player: shooter, row, col, result, sunk, win };
  next.phase = win ? 'over' : 'battle';
  next.turn = win ? shooter : defender;
  return next;
}
