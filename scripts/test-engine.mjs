// BATTLE ON THE LAKE — engine + Harbormaster checks. Plain Node, no test
// framework. Run with:  node scripts/test-engine.mjs

import {
  SIZE, P1, P2, VESSELS, createInitialState, legalMoves, applyMove, getStatus,
  cellsFor, canPlace, allPlaced, isSunk, fleetSunk, shotResult, opponent,
} from '../js/engine.js';
import { chooseMove } from '../js/bot.js';

let passed = 0;

function assert(condition, label) {
  if (!condition) {
    console.error(`✗ FAIL: ${label}`);
    process.exit(1);
  }
  passed++;
  console.log(`✓ ${label}`);
}

function throws(fn, label) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, label);
}

// A deterministic stand-in for Math.random so bot tests are repeatable.
function seededRng(seed) {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Both fleets in known spots, ready to fight. Player 1's fleet mirrors 2's. */
function battleState() {
  let s = createInitialState({ seed: 42 });
  const moor = [
    { vessel: 'ferry', row: 0, col: 0, dir: 'h' },    // (0,0)–(0,4)
    { vessel: 'schooner', row: 2, col: 0, dir: 'h' }, // (2,0)–(2,3)
    { vessel: 'cutter', row: 4, col: 0, dir: 'h' },   // (4,0)–(4,2)
    { vessel: 'sailboat', row: 6, col: 0, dir: 'h' }, // (6,0)–(6,2)
    { vessel: 'kayak', row: 8, col: 0, dir: 'h' },    // (8,0)–(8,1)
  ];
  for (const player of [P1, P2]) {
    for (const m of moor) s = applyMove(s, { type: 'place', ...m });
    s = applyMove(s, { type: 'ready' });
  }
  return s;
}

/* ---------------------------------------------------------- fresh state */

{
  const s = createInitialState({ seed: 7 });
  const st = getStatus(s);
  assert(st.phase === 'place' && st.placing === P1 && !st.over, 'fresh lake: player 1 is placing');
  const moves = legalMoves(s);
  assert(moves.some((m) => m.type === 'place'), 'placement moves are on offer');
  assert(moves.some((m) => m.type === 'scatter'), 'scatter is on offer');
  assert(!moves.some((m) => m.type === 'ready'), 'no ready until the fleet is down');
  const ferryMoves = moves.filter((m) => m.type === 'place' && m.vessel === 'ferry');
  assert(ferryMoves.length === 2 * SIZE * (SIZE - 4), 'ferry has exactly 120 open moorings on an empty lake');
}

/* ---------------------------------------------------------- placement rules */

{
  let s = createInitialState();
  s = applyMove(s, { type: 'place', vessel: 'ferry', row: 0, col: 0, dir: 'h' });
  throws(() => applyMove(s, { type: 'place', vessel: 'schooner', row: 0, col: 0, dir: 'v' }),
    'overlapping mooring is rejected');
  throws(() => applyMove(s, { type: 'place', vessel: 'kayak', row: 9, col: 9, dir: 'v' }),
    'mooring off the bottom edge is rejected');
  throws(() => applyMove(s, { type: 'place', vessel: 'schooner', row: 3, col: 7, dir: 'h' }),
    'mooring off the right edge is rejected');
  throws(() => applyMove(s, { type: 'place', vessel: 'canoe', row: 0, col: 0, dir: 'h' }),
    'unknown vessel is rejected');
  throws(() => applyMove(s, { type: 'ready' }), 'ready with a half-moored fleet is rejected');

  // Re-placing your own vessel never collides with itself.
  assert(canPlace(s, P1, 'ferry', 0, 1, 'h'), 'a vessel can re-moor over its own old spot');
  s = applyMove(s, { type: 'place', vessel: 'ferry', row: 0, col: 1, dir: 'h' });
  assert(s.players[1].fleet.ferry.col === 1, 'dragging a moored vessel to a new spot works');
}

{
  // Scatter: all five afloat, all legal, and deterministic for a given seed.
  const a = applyMove(createInitialState({ seed: 123 }), { type: 'scatter' });
  const b = applyMove(createInitialState({ seed: 123 }), { type: 'scatter' });
  const c = applyMove(createInitialState({ seed: 999 }), { type: 'scatter' });
  assert(allPlaced(a, P1), 'scatter moors the whole fleet');
  const cells = new Set();
  let legal = true;
  for (const v of VESSELS) {
    for (const cell of cellsFor(v.id, a.players[1].fleet[v.id])) {
      if (cell.row < 0 || cell.row >= SIZE || cell.col < 0 || cell.col >= SIZE) legal = false;
      const key = `${cell.row},${cell.col}`;
      if (cells.has(key)) legal = false;
      cells.add(key);
    }
  }
  assert(legal && cells.size === 17, 'scattered fleet: 17 cells, no overlaps, all on the lake');
  assert(JSON.stringify(a.players[1].fleet) === JSON.stringify(b.players[1].fleet),
    'same seed scatters the same fleet');
  assert(JSON.stringify(a.players[1].fleet) !== JSON.stringify(c.players[1].fleet),
    'different seed scatters a different fleet');
  assert(a.seed !== 123, 'scatter advances the seed in the state');
}

{
  // Ready hands the lake to player 2, then opens the battle.
  let s = applyMove(createInitialState({ seed: 5 }), { type: 'scatter' });
  s = applyMove(s, { type: 'ready' });
  assert(getStatus(s).placing === P2, 'after player 1 is ready, player 2 places');
  s = applyMove(s, { type: 'scatter' });
  s = applyMove(s, { type: 'ready' });
  const st = getStatus(s);
  assert(st.phase === 'battle' && st.turn === P1, 'both fleets down: battle opens, player 1 fires first');
  throws(() => applyMove(s, { type: 'place', vessel: 'kayak', row: 0, col: 0, dir: 'h' }),
    'no re-mooring once the battle starts');
}

/* ---------------------------------------------------------- battle */

{
  let s = battleState();

  // A miss: open water at (9,9). Turn passes to player 2.
  s = applyMove(s, { type: 'fire', row: 9, col: 9 });
  assert(s.last.result === 'miss' && s.last.sunk === null, 'miss reported as a miss');
  assert(getStatus(s).turn === P2, 'turn alternates after every shot');
  assert(shotResult(s, P1, 9, 9) === 'miss', 'shooter remembers the miss');

  // Player 2 hits player 1's kayak at (8,0).
  s = applyMove(s, { type: 'fire', row: 8, col: 0 });
  assert(s.last.result === 'hit' && s.last.sunk === null, 'hit reported, vessel still afloat');
  assert(shotResult(s, P2, 8, 0) === 'hit', 'shooter sees the hit');

  // Repeats are illegal — for the same player, once their turn comes back.
  s = applyMove(s, { type: 'fire', row: 9, col: 8 }); // p1 misses again
  throws(() => applyMove(s, { type: 'fire', row: 8, col: 0 }),
    'firing twice at the same cell is rejected');
  assert(!legalMoves(s).some((m) => m.row === 8 && m.col === 0),
    'a shot cell leaves the legal-move list');

  // Sink the kayak: second cell (8,1). Defender announces it by name.
  s = applyMove(s, { type: 'fire', row: 8, col: 1 });
  assert(s.last.result === 'hit' && s.last.sunk === 'kayak', 'sunk vessel announced by name');
  assert(isSunk(s, P2, 'kayak'), 'isSunk agrees the kayak is down');
  assert(shotResult(s, P2, 8, 0) === 'sunk', "the kayak's cells now read as sunk");
  assert(!s.last.win && getStatus(s).winner === null, 'one sinking is not the war');
}

{
  // Fire out of bounds is rejected.
  const s = battleState();
  throws(() => applyMove(s, { type: 'fire', row: 10, col: 0 }), 'shot off the lake is rejected');
  throws(() => applyMove(s, { type: 'fire', row: 0, col: -1 }), 'negative shot is rejected');
}

{
  // Win: player 1 sinks the whole fleet while player 2 fires into open water.
  let s = battleState();
  const targets = [];
  for (const v of VESSELS) targets.push(...cellsFor(v.id, s.players[2].fleet[v.id]));
  const water = [];
  for (let col = 0; col < SIZE; col++) for (let row = 0; row < SIZE; row++) {
    if (row % 2 === 1) water.push({ row, col }); // odd rows are all open water
  }
  let wi = 0;
  for (const t of targets) {
    s = applyMove(s, { type: 'fire', row: t.row, col: t.col }); // p1
    if (getStatus(s).over) break;
    const w = water[wi++];
    s = applyMove(s, { type: 'fire', row: w.row, col: w.col }); // p2 misses
  }
  const st = getStatus(s);
  assert(st.over && st.winner === P1 && s.last.win, 'sinking all five vessels wins the battle');
  assert(fleetSunk(s, P1), 'fleetSunk agrees');
  assert(legalMoves(s).length === 0, 'no legal moves after the war is won');
  throws(() => applyMove(s, { type: 'fire', row: 9, col: 9 }), 'no firing after the battle ends');
}

/* ---------------------------------------------------------- purity */

{
  // applyMove never mutates its input.
  const before = battleState();
  const snapshot = JSON.stringify(before);
  applyMove(before, { type: 'fire', row: 5, col: 5 });
  applyMove(before, { type: 'fire', row: 0, col: 0 });
  assert(JSON.stringify(before) === snapshot, 'applyMove returns a new state, never mutates');

  const fresh = createInitialState({ seed: 88 });
  const freshSnap = JSON.stringify(fresh);
  applyMove(fresh, { type: 'scatter' });
  applyMove(fresh, { type: 'place', vessel: 'kayak', row: 0, col: 0, dir: 'h' });
  assert(JSON.stringify(fresh) === freshSnap, 'place and scatter never mutate either');
}

{
  // State survives a JSON round trip mid-battle — that's the online plan.
  let s = battleState();
  s = applyMove(s, { type: 'fire', row: 8, col: 0 });
  s = JSON.parse(JSON.stringify(s));
  s = applyMove(s, { type: 'fire', row: 3, col: 3 });
  s = applyMove(s, { type: 'fire', row: 8, col: 1 });
  assert(s.last.sunk === 'kayak' && getStatus(s).turn === P2,
    'state survives JSON.stringify → parse → resume');
}

/* ---------------------------------------------------------- the Harbormaster */

{
  // Placement: the bot scatters, then declares ready, through the engine.
  let s = createInitialState({ seed: 31 });
  s = applyMove(s, chooseMove(s));
  assert(allPlaced(s, P1), 'bot scatters its fleet');
  s = applyMove(s, chooseMove(s));
  assert(getStatus(s).placing === P2, 'bot declares ready and hands the lake over');
}

{
  // Crafted wound: player 2 has hit the ferry (0,0)–(0,4) at (0,2) only.
  // The bot must probe an orthogonal neighbor, then finish the ferry fast.
  const rng = seededRng(7);
  let s = battleState();
  // Open water for player 1 to waste shots in: every odd row is empty.
  const filler = [];
  for (const row of [9, 7, 5]) for (let col = 0; col < SIZE; col++) filler.push({ row, col });
  let fi = 0;
  s = applyMove(s, { type: 'fire', ...filler[fi++] }); // p1 wastes a shot
  s = applyMove(s, { type: 'fire', row: 0, col: 2 }); // p2 wounds the ferry
  assert(s.last.result === 'hit', 'crafted position: the ferry is wounded');
  s = applyMove(s, { type: 'fire', ...filler[fi++] }); // p1 again; p2 to move

  const first = chooseMove(s, rng);
  const near = Math.abs(first.row - 0) + Math.abs(first.col - 2) === 1;
  assert(first.type === 'fire' && near, 'bot targets a cell adjacent to the fresh hit');

  let botShots = 0;
  while (!isSunk(s, P2, 'ferry') && botShots < 12) {
    s = applyMove(s, chooseMove(s, rng)); // the bot works the wound
    botShots++;
    if (isSunk(s, P2, 'ferry')) break;
    s = applyMove(s, { type: 'fire', ...filler[fi++] }); // p1 keeps missing
  }
  assert(isSunk(s, P2, 'ferry'), `bot finishes the wounded ferry (${botShots + 1} shots incl. the wound)`);
  assert(botShots <= 9, 'bot hunts the ferry down without wandering off');
}

{
  // Full bot-vs-bot war: legal throughout, no shot repeated by either side,
  // parity hunting until first blood, and somebody wins.
  const rng = seededRng(2026);
  let s = createInitialState({ seed: 1401 });
  while (getStatus(s).phase === 'place') s = applyMove(s, chooseMove(s, rng));

  const fired = { 1: new Set(), 2: new Set() };
  let shots = 0;
  let parityClean = true;
  let sawFirstHit = { 1: false, 2: false };
  while (!getStatus(s).over && shots < 250) {
    const me = getStatus(s).turn;
    const move = chooseMove(s, rng);
    const key = `${move.row},${move.col}`;
    if (fired[me].has(key)) {
      assert(false, 'bot never repeats a shot');
    }
    fired[me].add(key);
    // Until a bot has ever hit anything, every shot must sit on the checkerboard.
    if (!sawFirstHit[me] && (move.row + move.col) % 2 !== 0) parityClean = false;
    s = applyMove(s, move);
    if (s.last.result === 'hit') sawFirstHit[me] = true;
    shots++;
  }
  assert(getStatus(s).over, `bot-vs-bot war ends (${shots} shots)`);
  assert(getStatus(s).winner === P1 || getStatus(s).winner === P2, 'the war has a winner');
  assert(fired[1].size + fired[2].size === shots, 'no repeated shots across the whole war');
  assert(parityClean, 'hunting sticks to the checkerboard until first blood');
  assert(shots <= 200, 'the war ends in sane time (each side has only 100 cells)');
}

console.log(`\n⚓ All ${passed} checks passed. Ship it.`);
