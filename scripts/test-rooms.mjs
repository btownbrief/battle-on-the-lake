// Online-rooms wiring test: drives the real vendored client (js/rooms.js)
// against the local shim (scripts/rooms-shim.mjs) as two simulated phones,
// then plays a full online naval duel through the real engine. No network.
//
//   node scripts/test-rooms.mjs

import { createRooms } from './rooms-shim.mjs';
import {
  P1, P2, createInitialState, legalMoves, applyMove, getStatus, allPlaced,
} from '../js/engine.js';

const GAME = 'battle-on-the-lake';

/* ------------------------------------------------- two-phone environment */

const stores = new Map();
let current = 'A';
globalThis.localStorage = {
  getItem: (key) => (stores.get(current).has(key) ? stores.get(current).get(key) : null),
  setItem: (key, value) => stores.get(current).set(key, String(value)),
  removeItem: (key) => stores.get(current).delete(key),
};

function device(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  current = name;
}

device('A');
device('B');

let passed = 0;
function t(condition, label) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  passed++;
  console.log(`  ok — ${label}`);
}

async function expectCode(promise, code, label) {
  try {
    await promise;
    t(false, `${label} (no error thrown)`);
  } catch (err) {
    t(err?.code === code, `${label} (got ${err?.code})`);
  }
}

const shim = createRooms();
globalThis.BTOWN_ROOMS_URL = 'http://rooms.test';
globalThis.fetch = async (url, init = {}) => {
  const match = String(url).match(/\/rest\/v1\/rpc\/(\w+)$/);
  const send = (status, body) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  if (!match || !shim.rpcs[match[1]]) return send(404, { message: 'not a room rpc' });
  try {
    const args = JSON.parse(init.body || '{}');
    return send(200, shim.rpcs[match[1]](args) ?? {});
  } catch (err) {
    if (err.rpc) return send(400, { message: err.message });
    return send(500, { message: String(err) });
  }
};
const { OnlineMatch, savedSession } = await import('../js/rooms.js');

/* ------------------------------------------------------------ the tests */

device('A');
const host = await OnlineMatch.create({
  game: GAME,
  name: 'Admiral A',
  state: createInitialState({ seed: 101 }),
  seats: 2,
});
t(/^[A-Z2-9]{4}$/.test(host.code) && host.seat === 0 && host.status === 'waiting',
  'host creates room in seat 0');
t(savedSession(GAME)?.roomId === host.roomId, 'host session saved');

device('B');
await expectCode(
  OnlineMatch.join({ game: GAME, code: 'ZZZZ', name: 'X' }),
  'not_found',
  'bad code rejected',
);
await expectCode(
  OnlineMatch.join({ game: 'four-in-a-rowboat', code: host.code, name: 'X' }),
  'wrong_game',
  'wrong game rejected',
);
const guest = await OnlineMatch.join({
  game: GAME,
  code: ` ${host.code.toLowerCase()} `,
  name: 'Admiral B',
});
t(guest.seat === 1 && guest.status === 'playing',
  'guest joins seat 1 (sloppy code accepted), game starts');
t(guest.opponents().length === 1 && guest.opponents()[0].name === 'Admiral A',
  'guest sees host name');

device('A');
await host._fetch();
t(host.status === 'playing' && host.opponents()[0].name === 'Admiral B',
  'host poll sees game start');

// Referee checks using legal engine moves: host places first, then guest.
const hostFleet = applyMove(host.state, { type: 'scatter' });
await host.push(hostFleet);
t(host.version === 1 && allPlaced(host.state, P1), 'host pushes its fleet, version 1');

device('B');
await guest._fetch();
t(allPlaced(guest.state, P1) && guest.state.turn === P1,
  'guest receives host placement state');

device('A');
const hostReady = applyMove(host.state, { type: 'ready' });
await host.push(hostReady);
t(host.version === 2 && host.state.turn === P2, 'host readies; engine hands placement to seat 1');

device('B');
await guest._fetch();
const guestFleet = applyMove(guest.state, { type: 'scatter' });
await guest.push(guestFleet);
t(guest.version === 3 && allPlaced(guest.state, P2), 'guest pushes only its own fleet');

device('A');
const staleState = applyMove(hostReady, { type: 'scatter' });
await expectCode(host.push(staleState), 'version_conflict', 'stale push rejected');
t(host.version === 3 && JSON.stringify(host.state) === JSON.stringify(guest.state),
  'conflict refetches the room truth');

// Full game through the engine. Placement prefers READY once a fleet is set;
// battle shots use a deterministic pseudo-random legal move.
const phones = {
  [P1]: { match: host, device: 'A' },
  [P2]: { match: guest, device: 'B' },
};
let cursor = 0x5eed1234;
const randomIndex = (length) => {
  cursor = (Math.imul(cursor, 1664525) + 1013904223) >>> 0;
  return cursor % length;
};
let moves = 0;

device('A');
await host._fetch();
device('B');
await guest._fetch();

while (!getStatus(host.state).over && moves < 400) {
  if (JSON.stringify(host.state) !== JSON.stringify(guest.state)) {
    console.error(`FAIL: phones diverged before move ${moves + 1}`);
    process.exit(1);
  }
  const stateNow = host.state;
  const mover = phones[stateNow.turn];
  device(mover.device);
  await mover.match._fetch();
  const movesNow = legalMoves(mover.match.state);
  const ready = movesNow.find((move) => move.type === 'ready');
  const scatter = movesNow.find((move) => move.type === 'scatter');
  const move = ready || scatter || movesNow[randomIndex(movesNow.length)];
  const next = applyMove(mover.match.state, move);
  await mover.match.push(next, { over: getStatus(next).over });

  device('A');
  await host._fetch();
  device('B');
  await guest._fetch();
  moves++;
}

t(moves <= 400 && getStatus(host.state).over, `full online duel ends in ${moves} moves`);
t(host.status === 'over' && guest.status === 'over', 'both phones see the finished room');
t(JSON.stringify(host.state) === JSON.stringify(guest.state), 'end states are JSON-identical');

// Either phone can launch a rematch; the same engine again makes player 1
// (the host's seat) the first placer and first shooter.
const finishedVersion = guest.version;
device('B');
await guest.push(createInitialState({ seed: 202 }), {});
t(guest.status === 'playing' && guest.version === finishedVersion + 1,
  'guest can launch a rematch');
t(guest.state.turn === P1 && guest.state.firstShooter === P1,
  'rematch still opens with the host engine seat');

// Resume after a refresh.
device('A');
const resumed = await OnlineMatch.resume({ game: GAME });
t(resumed.roomId === host.roomId && resumed.seat === 0 && resumed.status === 'playing',
  'resume reattaches host to the room');

// Leave: other side sees the flag, session is cleared.
await resumed.leave();
t(savedSession(GAME) === null, 'leave clears the session');
device('B');
await guest._fetch();
t(guest.status === 'over' && guest.opponents()[0].left === true,
  'guest sees host leave');

// A full room turns away a third phone.
device('A');
const secondHost = await OnlineMatch.create({
  game: GAME,
  name: 'A',
  state: createInitialState(),
});
device('B');
await OnlineMatch.join({ game: GAME, code: secondHost.code, name: 'B' });
device('C');
await expectCode(
  OnlineMatch.join({ game: GAME, code: secondHost.code, name: 'C' }),
  'room_started',
  'third phone turned away',
);

// A missing backend reports a clean not_ready code.
{
  globalThis.BTOWN_ROOMS_URL = 'http://rooms-not-ready.test';
  globalThis.fetch = async () => new Response('{}', { status: 404 });
  const fresh = await import('../js/rooms.js?not-ready');
  await expectCode(
    fresh.OnlineMatch.create({ game: GAME, name: 'A', state: {} }),
    'not_ready',
    'missing backend reads as not_ready',
  );
}

console.log(`\nALL ROOMS TESTS PASSED (${passed} checks)`);
process.exit(0);
