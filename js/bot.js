// BATTLE ON THE LAKE — the Harbormaster, the lake's resident opponent.
//
// This module only talks to the engine through its public API — legalMoves,
// applyMove is never needed here, shotResult, allPlaced, getStatus — plus the
// exported constants. It never reads the enemy fleet out of the state; its
// entire view of your waters is shotResult(), exactly what a human attacker
// knows. No rule logic lives here.
//
// Strategy, the classic two phases:
//   HUNT   — fire on checkerboard cells (row+col even). The smallest vessel,
//            the Kayak, is 2 cells long, so every vessel touches that
//            checkerboard — half the lake never needs a first look.
//   TARGET — after a hit, work the orthogonal neighbors; once two hits line
//            up, push along that line's ends until the vessel goes down.
// Never repeats a shot: every candidate is drawn from unshot cells only.

import { SIZE, getStatus, shotResult, allPlaced } from './engine.js';

/**
 * Pick the Harbormaster's next move for the side whose turn it is.
 * Returns a plain engine move. `rng` is injectable for tests; the engine
 * itself never sees it.
 */
export function chooseMove(state, rng = Math.random) {
  const status = getStatus(state);
  if (status.over) throw new Error('The battle is over — nothing left to do.');

  if (status.phase === 'place') {
    return allPlaced(state, status.placing) ? { type: 'ready' } : { type: 'scatter' };
  }

  const me = status.turn;
  const unshot = [];
  const hits = []; // 'hit' but not 'sunk': part of a vessel still afloat
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const r = shotResult(state, me, row, col);
      if (r === null) unshot.push({ row, col });
      else if (r === 'hit') hits.push({ row, col });
    }
  }

  const candidates =
    (hits.length > 0 && targetCandidates(state, me, hits)) ||
    huntCandidates(unshot);
  const pick = candidates[Math.floor(rng() * candidates.length)];
  return { type: 'fire', row: pick.row, col: pick.col };
}

/* ------------------------------------------------------------- targeting */

function unshotAt(state, me, row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE &&
    shotResult(state, me, row, col) === null;
}

// Cells worth firing at while a wounded vessel is out there. Never empty:
// a still-afloat vessel is a straight line, so some unshot cell always
// borders one of its hits. (Returns false — never [] — when out of line
// ends, so the caller can fall through to plain neighbors.)
function targetCandidates(state, me, hits) {
  // Two or more hits in a line: shoot just past either end first.
  if (hits.length >= 2) {
    const rows = new Set(hits.map((h) => h.row));
    const cols = new Set(hits.map((h) => h.col));
    let ends = null;
    if (rows.size === 1) {
      const row = hits[0].row;
      const cs = hits.map((h) => h.col);
      ends = [
        { row, col: Math.min(...cs) - 1 },
        { row, col: Math.max(...cs) + 1 },
      ];
    } else if (cols.size === 1) {
      const col = hits[0].col;
      const rs = hits.map((h) => h.row);
      ends = [
        { row: Math.min(...rs) - 1, col },
        { row: Math.max(...rs) + 1, col },
      ];
    }
    if (ends) {
      const open = ends.filter((c) => unshotAt(state, me, c.row, c.col));
      if (open.length) return open;
    }
  }
  // Otherwise: any unshot orthogonal neighbor of any live hit.
  const seen = new Set();
  const neighbors = [];
  for (const h of hits) {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const row = h.row + dr;
      const col = h.col + dc;
      const key = `${row},${col}`;
      if (!seen.has(key) && unshotAt(state, me, row, col)) {
        seen.add(key);
        neighbors.push({ row, col });
      }
    }
  }
  return neighbors.length ? neighbors : false;
}

/* ------------------------------------------------------------- hunting */

function huntCandidates(unshot) {
  const parity = unshot.filter((c) => (c.row + c.col) % 2 === 0);
  return parity.length ? parity : unshot;
}
