// BATTLE ON THE LAKE — UI only. A Btown Games production for the BTown Brief.
//
// This file renders state, runs the drag-to-place dock, the pass-and-play
// handoff blocker, and the battle screens. Every rule lives in js/engine.js
// and every Harbormaster decision in js/bot.js — if you're tempted to check
// for a hit or a sinking here, stop and ask the engine instead.

import {
  SIZE, P1, P2, VESSELS, createInitialState, applyMove, getStatus,
  canPlace, allPlaced, isSunk, shotResult, vesselAt, opponent,
} from './engine.js';
import { chooseMove } from './bot.js';
import { sound } from './audio.js';
import { OnlineMatch, savedSession, clearSession, getName } from './rooms.js';

const $ = (id) => document.getElementById(id);
const screens = {
  menu: $('menu'),
  place: $('place'),
  onlineWait: $('onlineWait'),
  handoff: $('handoff'),
  battle: $('battle'),
};
const placeBoard = $('placeBoard');
const placeCells = $('placeCells');
const placeShips = $('placeShips');
const ghostEl = $('ghost');
const fleetTray = $('fleetTray');
const placeHint = $('placeHint');
const placeWho = $('placeWho');
const readyBtn = $('readyBtn');
const targetCells = $('targetCells');
const targetShips = $('targetShips');
const targetFx = $('targetFx');
const ownCells = $('ownCells');
const ownShips = $('ownShips');
const ownShots = $('ownShots');
const turnChip = $('turnChip');
const statusLine = $('statusLine');
const tallyEl = $('tally');
const enemyLabel = $('enemyLabel');
const ownLabel = $('ownLabel');
const passBtn = $('passBtn');
const resultBar = $('resultbar');
const resultText = $('resultText');
const champEl = $('champ');
const champBubble = $('champBubble');
const handoffTitle = $('handoffTitle');
const handoffSub = $('handoffSub');
const handoffBtn = $('handoffBtn');
const targetSelectionEl = $('targetSelection');
const fireBtn = $('fireBtn');
const onlinePanel = $('onlinePanel');
const opTitle = $('opTitle');
const opName = $('opName');
const opCodeWrap = $('opCodeWrap');
const opCode = $('opCode');
const opError = $('opError');
const lobbyEl = $('lobby');
const lobbyCode = $('lobbyCode');
const rejoinBtn = $('rejoinBtn');
const onlineWaitTitle = $('onlineWaitTitle');
const onlineWaitSub = $('onlineWaitSub');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------- copy desk */

const VESSEL_UI = {
  ferry: {
    label: 'FERRY',
    icon: '<svg class="vessel-icon" viewBox="0 0 64 28" aria-hidden="true" focusable="false"><path d="M4 17h56l-7 8H13z"/><path d="M14 8h34v9H14z"/><path class="icon-accent" d="M18 11h7v4h-7zm11 0h7v4h-7zm11 0h5v4h-5zM21 4h5v4h-5zm16 0h5v4h-5z"/></svg>',
  },
  schooner: {
    label: 'SCHOONER',
    icon: '<svg class="vessel-icon" viewBox="0 0 64 28" aria-hidden="true" focusable="false"><path d="M7 20h52l-8 6H16z"/><path d="M24 3h2v17h-2zm18 2h2v15h-2z"/><path class="icon-accent" d="M22 5 9 18h13zm6 0 12 13H28zm18 2 12 11H46z"/></svg>',
  },
  cutter: {
    label: 'CUTTER',
    icon: '<svg class="vessel-icon" viewBox="0 0 64 28" aria-hidden="true" focusable="false"><path d="M4 18h56l-9 8H13zM21 9h26l7 9H17z"/><path class="icon-accent" d="m27 18 7-9h7l-7 9z"/><path d="M35 4h3v5h-3z"/></svg>',
  },
  sailboat: {
    label: 'SAILBOAT',
    icon: '<svg class="vessel-icon" viewBox="0 0 64 28" aria-hidden="true" focusable="false"><path d="M31 2h2v20h-2z"/><path class="icon-accent" d="M29 4 13 20h16zm6 2 15 14H35z"/><path d="M13 21h39l-7 5H20z"/></svg>',
  },
  kayak: {
    label: 'KAYAK',
    icon: '<svg class="vessel-icon" viewBox="0 0 64 28" aria-hidden="true" focusable="false"><path d="M3 14C12 6 52 6 61 14 52 22 12 22 3 14Z"/><ellipse class="icon-accent" cx="32" cy="14" rx="9" ry="5"/><path d="m17 4 3-2 27 22-3 2z"/><path class="icon-accent" d="m13 2 9 2-4 5zm38 24-9-2 4-5z"/></svg>',
  },
};
const VESSEL_SIZE = {};
const VESSEL_NAME = {};
for (const v of VESSELS) {
  VESSEL_SIZE[v.id] = v.size;
  VESSEL_NAME[v.id] = v.name;
}

const CAPTAINS = { [P1]: 'CAPTAIN GREEN', [P2]: 'CAPTAIN GOLD' };
const SHORES = { [P1]: 'VERMONT SHORE', [P2]: 'NEW YORK SHORE' };
const COLORS = { [P1]: 'green', [P2]: 'gold' };

const MISS_LINES = [
  'a miss. Just lake.',
  'splash — nothing but water.',
  'a miss. The loons are unbothered.',
  'a miss. You woke a lake trout.',
  'nothing. Cold, deep nothing.',
];
const HIT_LINES = ['HIT! Right in the hull.', 'HIT! Timbers, shivered.', "HIT! That'll leave a mark."];
const SUNK_LINES = {
  ferry: 'THE FERRY IS DOWN! No crossing today.',
  schooner: 'THE SCHOONER IS SUNK! Straight to the broad lake floor.',
  cutter: 'THE CUTTER IS SUNK! Who guards the guards?',
  sailboat: 'THE SAILBOAT CAPSIZED! Summer is cancelled.',
  kayak: "THE KAYAK WENT UNDER! Should've portaged.",
};
const CHAMP_LINES = [
  'ADMIRAL OF THE BROAD LAKE!',
  'Champ saw the whole thing. 🦕',
  'The breakwater salutes you.',
  'ECHO, from the waterfront: nice shooting.',
  'Smoothest campaign since the ice went out.',
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const coordName = (row, col) => `${String.fromCharCode(65 + col)}${row + 1}`;

/* ------------------------------------------------------------- game shell */

let mode = 'bot'; // 'bot' | 'pass' | 'online'
let state = null;
let view = P1; // whose eyes the battle screen uses
let busy = false;
let botTimer = 0;
let passTimer = 0;
let resultTimer = 0;
let tally = { [P1]: 0, [P2]: 0 };
let selected = null; // vessel id selected on the placement board
let targetSelection = null;
let handoffGo = null;
let online = null; // { match, myPlayer } for this phone's fixed seat
let pollErrors = 0;
let leaveTimer = 0;
let countedFinishedState = null;

function newSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
}

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle('hidden', key !== name);
  }
}

function clearTimers() {
  clearTimeout(botTimer);
  clearTimeout(passTimer);
  clearTimeout(resultTimer);
  clearTimeout(leaveTimer);
}

/* ------------------------------------------------------------- build once */

function buildCells(el, tag, onTap) {
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const cell = document.createElement(tag);
      cell.dataset.row = row;
      cell.dataset.col = col;
      if (onTap) {
        cell.setAttribute('aria-label', `Select target ${coordName(row, col)}`);
        cell.addEventListener('click', () => onTap(row, col));
      }
      el.appendChild(cell);
    }
  }
}

buildCells(placeCells, 'div');
buildCells(targetCells, 'button', onTargetTap);
buildCells(ownCells, 'div');
for (let col = 0; col < SIZE; col++) {
  const span = document.createElement('span');
  span.textContent = String.fromCharCode(65 + col);
  $('colLabels').appendChild(span);
}
for (let row = 0; row < SIZE; row++) {
  const span = document.createElement('span');
  span.textContent = row + 1;
  $('rowLabels').appendChild(span);
}

document.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => startMatch(btn.dataset.mode));
});
$('placeDock').addEventListener('click', backToDock);
$('dockBtn').addEventListener('click', backToDock);
$('onlineWaitDock').addEventListener('click', backToDock);
$('rotateBtn').addEventListener('click', rotateSelected);
$('scatterBtn').addEventListener('click', scatterFleet);
readyBtn.addEventListener('click', declareReady);
$('rematchBtn').addEventListener('click', rematch);
passBtn.addEventListener('click', handPhoneOver);
fireBtn.addEventListener('click', fireSelectedTarget);
handoffBtn.addEventListener('click', () => {
  const go = handoffGo;
  handoffGo = null;
  if (go) go();
});
document.querySelectorAll('.mute-btn').forEach((btn) => {
  btn.textContent = sound.muted ? '🔇' : '🔊';
  btn.addEventListener('click', () => {
    const muted = sound.toggleMuted();
    document.querySelectorAll('.mute-btn').forEach((b) => { b.textContent = muted ? '🔇' : '🔊'; });
  });
});

/* ------------------------------------------------------------- match flow */

function startMatch(chosen) {
  mode = chosen;
  online = null;
  clearTimers();
  tally = { [P1]: 0, [P2]: 0 };
  newRound();
}

function newRound() {
  clearTimers();
  state = createInitialState({ seed: newSeed() });
  busy = false;
  selected = null;
  targetSelection = null;
  countedFinishedState = null;
  resultBar.classList.add('hidden');
  champEl.classList.add('hidden');
  passBtn.classList.add('hidden');
  if (mode === 'pass') {
    handoff(
      `<span class="green">${CAPTAINS[P1]}</span><br>set your fleet in secret`,
      `I'M ${CAPTAINS[P1]} ⚓`,
      () => beginPlacement()
    );
  } else {
    beginPlacement();
  }
}

function backToDock(event) {
  if (online) {
    const btn = event?.currentTarget;
    if (btn && btn.dataset.armed !== 'yes') {
      resetDockButtons();
      btn.dataset.armed = 'yes';
      btn.textContent = 'TAP AGAIN TO LEAVE';
      leaveTimer = setTimeout(resetDockButtons, 2600);
      return;
    }
    const match = online.match;
    online = null;
    match.leave(); // fire and forget: leaving also stops polling and clears the saved seat
  }
  cancelDrag();
  clearTimers();
  resetDockButtons();
  busy = false;
  targetSelection = null;
  mode = 'bot';
  showScreen('menu');
  refreshRejoin();
}

function rematch() {
  if (online) onlineRematch();
  else newRound();
}

function resetDockButtons() {
  for (const id of ['placeDock', 'dockBtn', 'onlineWaitDock']) {
    const btn = $(id);
    btn.dataset.armed = '';
    btn.textContent = '⚓ DOCK';
  }
}

function handoff(titleHtml, btnLabel, go) {
  handoffTitle.innerHTML = titleHtml;
  handoffBtn.textContent = btnLabel;
  handoffGo = go;
  showScreen('handoff');
}

/* ------------------------------------------------------------- placement */

function beginPlacement() {
  selected = null;
  renderPlace();
  showScreen('place');
}

function renderPlace() {
  const player = getStatus(state).placing;
  if (player === null) return;
  if (mode === 'online') {
    placeWho.textContent = `YOUR WATERS · ${SHORES[online.myPlayer]}`;
  } else {
    placeWho.innerHTML = mode === 'pass'
      ? `<span style="color: var(--${COLORS[player]})">${CAPTAINS[player]}</span> · ${SHORES[player]}`
      : `YOUR WATERS · ${SHORES[P1]}`;
  }

  // Moored vessels
  placeShips.innerHTML = '';
  const fleet = state.players[player].fleet;
  for (const v of VESSELS) {
    if (!fleet[v.id]) continue;
    const el = shipEl(v.id, fleet[v.id]);
    if (v.id === selected) el.classList.add('selected');
    el.addEventListener('pointerdown', (e) => startDrag(e, v.id, false));
    placeShips.appendChild(el);
  }

  // Vessels still on the trailer
  fleetTray.innerHTML = '';
  let waiting = 0;
  for (const v of VESSELS) {
    if (fleet[v.id]) continue;
    waiting++;
    const chip = document.createElement('button');
    chip.className = `tray-chip v-${v.id}`;
    chip.innerHTML = `<span class="tray-icon">${VESSEL_UI[v.id].icon}</span><span>${VESSEL_UI[v.id].label}</span>` +
      `<span class="t-cells">${'<i></i>'.repeat(v.size)}</span>`;
    chip.disabled = busy;
    chip.addEventListener('pointerdown', (e) => startDrag(e, v.id, true));
    fleetTray.appendChild(chip);
  }
  if (waiting === 0) {
    const done = document.createElement('div');
    done.className = 'tray-done';
    done.textContent = '⚓ The whole fleet is afloat.';
    fleetTray.appendChild(done);
  }

  $('rotateBtn').disabled = busy;
  $('scatterBtn').disabled = busy;
  readyBtn.disabled = busy || !allPlaced(state, player);
  placeHint.textContent = busy
    ? 'Signaling your fleet position to the other shore…'
    : waiting > 0
      ? 'Drag each vessel onto your waters — or scatter the fleet and shuffle from there.'
      : 'Tap a vessel to select it · ↻ rotates · drag to move. Ready when you are.';
}

function shipEl(vesselId, placement) {
  const el = document.createElement('div');
  const size = VESSEL_SIZE[vesselId];
  const vertical = placement.dir === 'v';
  el.className = `ship v-${vesselId}${vertical ? ' vertical' : ''}`;
  el.style.left = `${placement.col * 10}%`;
  el.style.top = `${placement.row * 10}%`;
  el.style.width = `${(vertical ? 1 : size) * 10}%`;
  el.style.height = `${(vertical ? size : 1) * 10}%`;
  el.innerHTML = `<span class="s-icon">${VESSEL_UI[vesselId].icon}</span>` +
    `<span class="s-label">${VESSEL_UI[vesselId].label}</span>`;
  return el;
}

/* ---------------------------------------------- drag-to-place, one pointer */

let drag = null;

function startDrag(e, vesselId, fromTray) {
  const player = getStatus(state).placing;
  if (drag || busy || player === null || !canActOnline(player)) return;
  e.preventDefault();
  const size = VESSEL_SIZE[vesselId];
  const placement = fromTray ? null : state.players[player].fleet[vesselId];
  const dir = placement ? placement.dir : 'h';

  // Which cell of the vessel the finger grabbed, so it doesn't jump.
  let grabIndex = Math.floor((size - 1) / 2);
  if (placement) {
    const { rowF, colF } = boardPoint(e);
    grabIndex = Math.max(0, Math.min(size - 1, Math.floor(
      dir === 'v' ? rowF - placement.row : colF - placement.col
    )));
  }

  drag = {
    vesselId, fromTray, dir, size, grabIndex, player,
    pointerId: e.pointerId,
    startX: e.clientX, startY: e.clientY,
    moved: false, valid: false, row: -1, col: -1,
    sourceEl: e.currentTarget,
  };
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragEnd);
}

function boardPoint(e) {
  const rect = placeCells.getBoundingClientRect();
  return {
    rowF: ((e.clientY - rect.top) / rect.height) * SIZE,
    colF: ((e.clientX - rect.left) / rect.width) * SIZE,
    onBoard:
      e.clientX > rect.left - 24 && e.clientX < rect.right + 24 &&
      e.clientY > rect.top - 24 && e.clientY < rect.bottom + 24,
  };
}

function onDragMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (!drag.moved) {
    if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) < 7) return;
    drag.moved = true;
    drag.sourceEl.classList.add('dragging');
  }
  const { rowF, colF, onBoard } = boardPoint(e);
  clearPreview();
  if (!onBoard) {
    drag.valid = false;
    ghostEl.classList.add('hidden');
    return;
  }
  const vertical = drag.dir === 'v';
  let row = Math.floor(rowF) - (vertical ? drag.grabIndex : 0);
  let col = Math.floor(colF) - (vertical ? 0 : drag.grabIndex);
  row = Math.max(0, Math.min(SIZE - (vertical ? drag.size : 1), row));
  col = Math.max(0, Math.min(SIZE - (vertical ? 1 : drag.size), col));
  drag.row = row;
  drag.col = col;
  drag.valid = canPlace(state, drag.player, drag.vesselId, row, col, drag.dir);

  // Footprint preview on the cells…
  const cells = placeCells.children;
  for (let i = 0; i < drag.size; i++) {
    const r = row + (vertical ? i : 0);
    const c = col + (vertical ? 0 : i);
    cells[r * SIZE + c].classList.add(drag.valid ? 'ok' : 'bad');
  }
  // …and the vessel itself floating over them.
  ghostEl.className = `ship v-${drag.vesselId}${vertical ? ' vertical' : ''}`;
  ghostEl.style.left = `${col * 10}%`;
  ghostEl.style.top = `${row * 10}%`;
  ghostEl.style.width = `${(vertical ? 1 : drag.size) * 10}%`;
  ghostEl.style.height = `${(vertical ? drag.size : 1) * 10}%`;
  ghostEl.innerHTML = `<span class="s-icon">${VESSEL_UI[drag.vesselId].icon}</span>`;
}

// Abandon an in-flight drag without dropping anything — used when the
// browser cancels the pointer or the screen changes out from under it.
function cancelDrag() {
  if (!drag) return;
  const d = drag;
  drag = null;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragEnd);
  clearPreview();
  ghostEl.classList.add('hidden');
  d.sourceEl.classList.remove('dragging');
  return d;
}

function onDragEnd(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = cancelDrag();
  // Only a real pointerup drops the vessel; a pointercancel abandons it.
  if (e.type !== 'pointerup') return;

  if (!d.moved) {
    // A plain tap: select a moored vessel for rotating.
    if (!d.fromTray) {
      selected = selected === d.vesselId ? null : d.vesselId;
      renderPlace();
    }
    return;
  }
  if (d.valid) {
    state = applyMove(state, { type: 'place', vessel: d.vesselId, row: d.row, col: d.col, dir: d.dir });
    selected = d.vesselId;
    sound.place();
    if (online) {
      publishOnlineMove();
      return;
    }
  }
  renderPlace();
}

function clearPreview() {
  for (const cell of placeCells.children) cell.classList.remove('ok', 'bad');
}

function rotateSelected() {
  const player = getStatus(state).placing;
  if (busy || player === null || !canActOnline(player)) return;
  const placement = selected && state.players[player].fleet[selected];
  if (!placement) {
    placeHint.textContent = 'Tap a moored vessel first, then rotate it.';
    return;
  }
  const size = VESSEL_SIZE[selected];
  const dir = placement.dir === 'h' ? 'v' : 'h';
  const row = Math.min(placement.row, SIZE - (dir === 'v' ? size : 1));
  const col = Math.min(placement.col, SIZE - (dir === 'h' ? size : 1));
  if (canPlace(state, player, selected, row, col, dir)) {
    state = applyMove(state, { type: 'place', vessel: selected, row, col, dir });
    sound.place();
    if (online) publishOnlineMove();
    else renderPlace();
  } else {
    placeBoard.classList.remove('shake');
    void placeBoard.offsetWidth;
    placeBoard.classList.add('shake');
    placeHint.textContent = `No room to swing ${VESSEL_NAME[selected]} there — drag it somewhere with open water.`;
  }
}

function scatterFleet() {
  const player = getStatus(state).placing;
  if (busy || player === null || !canActOnline(player)) return;
  cancelDrag();
  state = applyMove(state, { type: 'scatter' });
  selected = null;
  sound.scatter();
  if (online) publishOnlineMove();
  else renderPlace();
}

function declareReady() {
  const player = getStatus(state).placing;
  if (busy || player === null || !canActOnline(player) || !allPlaced(state, player)) return;
  cancelDrag();
  state = applyMove(state, { type: 'ready' });

  if (mode === 'online') {
    selected = null;
    publishOnlineMove();
    return;
  }

  if (mode === 'bot') {
    // The Harbormaster sets its fleet through the same engine you did.
    while (getStatus(state).phase === 'place') {
      state = applyMove(state, chooseMove(state));
    }
    beginTurn(P1);
    return;
  }

  const status = getStatus(state);
  if (status.phase === 'place') {
    handoff(
      `Hand the phone to<br><span class="gold">${CAPTAINS[P2]}</span>`,
      `I'M ${CAPTAINS[P2]} ⚓`,
      () => beginPlacement()
    );
  } else {
    handoff(
      `Fleets are set.<br><span class="green">${CAPTAINS[P1]}</span> fires first`,
      `I'M ${CAPTAINS[P1]} ⚓`,
      () => beginTurn(P1)
    );
  }
}

/* ------------------------------------------------------------- battle */

function beginTurn(player) {
  view = player;
  busy = false;
  targetSelection = null;
  passBtn.classList.add('hidden');
  renderBattle();
  // Catch the new captain up on the shot just taken against them.
  const last = state.last;
  if (mode === 'pass' && last && last.player === opponent(view)) {
    statusLine.textContent = `${CAPTAINS[opponent(view)]} fired ${coordName(last.row, last.col)} — ` +
      describeIncoming(last);
  } else {
    statusLine.textContent = 'Tap a target to select it. Tap it again or press FIRE.';
  }
  showScreen('battle');
}

function describeIncoming(last) {
  if (last.sunk) return SUNK_LINES[last.sunk].toLowerCase().replace('the ', 'your ');
  if (last.result === 'hit') {
    const vessel = vesselAt(state, view, last.row, last.col);
    return `a hit on your ${VESSEL_NAME[vessel].replace('the ', '')}.`;
  }
  return 'a miss. Your waters held.';
}

function renderBattle() {
  const status = getStatus(state);
  const enemy = opponent(view);

  if (mode === 'online') {
    enemyLabel.textContent = `ENEMY WATERS · ${opponentName().toUpperCase()}`;
    ownLabel.textContent = `YOUR FLEET · ${SHORES[view]}`;
  } else {
    enemyLabel.textContent = mode === 'bot'
      ? 'ENEMY WATERS · THE HARBORMASTER'
      : `ENEMY WATERS · ${CAPTAINS[enemy]}`;
    ownLabel.textContent = mode === 'bot'
      ? `YOUR FLEET · ${SHORES[P1]}`
      : `YOUR FLEET · ${SHORES[view]}`;
  }

  // Enemy waters: only what this shooter has learned.
  const cells = targetCells.children;
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const result = shotResult(state, view, row, col);
      cells[row * SIZE + col].className = result ?? '';
    }
  }
  renderTargetSelection();

  // Local modes lift the fog after the game. Online never renders an
  // opponent's unhit vessels, even though friendly-game state reaches both
  // phones through the shared room.
  targetShips.innerHTML = '';
  if (status.over && mode !== 'online') {
    const fleet = state.players[enemy].fleet;
    for (const v of VESSELS) {
      const el = shipEl(v.id, fleet[v.id]);
      el.style.pointerEvents = 'none';
      if (isSunk(state, view, v.id)) el.classList.add('sunk-ship');
      targetShips.appendChild(el);
    }
  }

  // Your own waters: your fleet, plus everything they've thrown at it.
  ownShips.innerHTML = '';
  const fleet = state.players[view].fleet;
  for (const v of VESSELS) {
    const el = shipEl(v.id, fleet[v.id]);
    el.style.pointerEvents = 'none';
    if (isSunk(state, enemy, v.id)) el.classList.add('sunk-ship');
    ownShips.appendChild(el);
  }
  ownShots.innerHTML = '';
  for (const [key, result] of Object.entries(state.players[enemy].shots)) {
    const [row, col] = key.split(',').map(Number);
    const mark = document.createElement('div');
    mark.className = result === 'hit' ? 'm-hit' : 'm-miss';
    mark.style.left = `${col * 10}%`;
    mark.style.top = `${row * 10}%`;
    ownShots.appendChild(mark);
  }

  renderTally();
  renderTurnChip();
}

function renderTally() {
  if (mode === 'online') {
    const mine = document.createElement('span');
    mine.className = `t-${COLORS[online.myPlayer]}`;
    mine.textContent = `YOU ${tally[online.myPlayer]}`;
    const dash = document.createTextNode(' — ');
    const theirs = document.createElement('span');
    theirs.className = `t-${COLORS[opponent(online.myPlayer)]}`;
    theirs.textContent = `${tally[opponent(online.myPlayer)]} ${opponentName().toUpperCase()}`;
    tallyEl.replaceChildren(mine, dash, theirs);
    return;
  }
  const a = `<span class="t-green">${mode === 'bot' ? 'YOU' : 'GREEN'} ${tally[P1]}</span>`;
  const b = `<span class="t-gold">${tally[P2]} ${mode === 'bot' ? 'HARBORMASTER' : 'GOLD'}</span>`;
  tallyEl.innerHTML = `${a} — ${b}`;
}

function renderTurnChip() {
  const status = getStatus(state);
  if (status.over) {
    turnChip.className = '';
    turnChip.textContent = '';
    return;
  }
  if (mode === 'bot') {
    if (status.turn === P1) {
      turnChip.className = 'green';
      turnChip.textContent = 'YOUR SHOT';
    } else {
      turnChip.className = 'gold thinking';
      turnChip.textContent = 'THE HARBORMASTER IS TAKING AIM…';
    }
  } else if (mode === 'online') {
    if (status.turn === online.myPlayer) {
      turnChip.className = COLORS[online.myPlayer];
      turnChip.textContent = 'YOUR SHOT';
    } else {
      const opp = online.match.opponents()[0];
      turnChip.className = `${COLORS[opponent(online.myPlayer)]} thinking`;
      turnChip.textContent = opp?.away
        ? `${opponentName().toUpperCase()} IS AWAY — HANG TIGHT…`
        : `${opponentName().toUpperCase()} IS TAKING AIM…`;
    }
  } else {
    turnChip.className = COLORS[view];
    turnChip.textContent = status.turn === view ? `${CAPTAINS[view]}'S SHOT` : 'SHOT AWAY — PASS THE PHONE';
  }
}

function renderTargetSelection() {
  const status = getStatus(state);
  const canFire = targetSelection !== null &&
    !busy &&
    status.phase === 'battle' &&
    status.turn === view &&
    canActOnline(view);
  const selectedIndex = targetSelection
    ? targetSelection.row * SIZE + targetSelection.col
    : -1;

  for (let i = 0; i < targetCells.children.length; i++) {
    const cell = targetCells.children[i];
    const isSelected = i === selectedIndex;
    cell.classList.toggle('selected-target', isSelected);
    cell.setAttribute('aria-pressed', String(isSelected));
  }

  targetSelectionEl.textContent = targetSelection
    ? `TARGET ${coordName(targetSelection.row, targetSelection.col)}`
    : 'SELECT A TARGET';
  fireBtn.disabled = !canFire;
}

function onTargetTap(row, col) {
  const status = getStatus(state);
  if (busy || status.phase !== 'battle' || status.turn !== view || !canActOnline(view)) return;
  if (shotResult(state, view, row, col) !== null) return;
  if (targetSelection?.row === row && targetSelection?.col === col) {
    fireSelectedTarget();
    return;
  }
  targetSelection = { row, col };
  renderTargetSelection();
  statusLine.textContent = `${coordName(row, col)} selected — tap again or press FIRE.`;
}

function fireSelectedTarget() {
  if (!targetSelection) return;
  const status = getStatus(state);
  const { row, col } = targetSelection;
  if (busy || status.phase !== 'battle' || status.turn !== view || !canActOnline(view)) return;
  if (shotResult(state, view, row, col) !== null) {
    targetSelection = null;
    renderTargetSelection();
    return;
  }
  busy = true;
  targetSelection = null;
  state = applyMove(state, { type: 'fire', row, col });
  const last = state.last;

  splash(targetFx, row, col, last);
  renderBattle();
  statusLine.textContent = `${coordName(row, col)} — ` +
    (last.sunk ? SUNK_LINES[last.sunk] : last.result === 'hit' ? pick(HIT_LINES) : pick(MISS_LINES));

  if (getStatus(state).over) {
    finishGame();
    if (online) publishOnlineMove();
  } else if (mode === 'bot') {
    botTimer = setTimeout(botTurn, reducedMotion ? 250 : 950);
  } else if (mode === 'online') {
    publishOnlineMove();
  } else {
    passTimer = setTimeout(() => passBtn.classList.remove('hidden'), 700);
  }
}

function botTurn() {
  state = applyMove(state, chooseMove(state));
  const last = state.last;
  renderBattle();
  splash(ownShots, last.row, last.col, last);
  statusLine.textContent = `The Harbormaster fires ${coordName(last.row, last.col)} — ` + describeIncoming(last);
  if (getStatus(state).over) {
    finishGame();
  } else {
    busy = false;
    renderTurnChip();
  }
}

function handPhoneOver() {
  passBtn.classList.add('hidden');
  const next = getStatus(state).turn;
  handoff(
    `Hand the phone to<br><span class="${COLORS[next]}">${CAPTAINS[next]}</span>`,
    `I'M ${CAPTAINS[next]} ⚓`,
    () => beginTurn(next)
  );
}

function splash(layer, row, col, last) {
  splashSound(last);
  if (reducedMotion) return;
  const fx = document.createElement('div');
  fx.className = 'fx';
  fx.style.left = `${col * 10}%`;
  fx.style.top = `${row * 10}%`;
  fx.textContent = last.sunk ? '🔥' : last.result === 'hit' ? '💥' : '💦';
  layer.appendChild(fx);
  setTimeout(() => fx.remove(), 600);
}

function splashSound(last) {
  if (last.sunk) sound.sunk();
  else if (last.result === 'hit') sound.hit();
  else sound.miss();
}

/* ------------------------------------------------------------- endgame */

function finishGame() {
  const winner = getStatus(state).winner;
  const firstFinish = countedFinishedState !== state;
  if (firstFinish) {
    tally[winner]++;
    countedFinishedState = state;
  }
  renderBattle();

  let text = '';
  let cls = '';
  if (mode === 'bot') {
    if (winner === P1) {
      text = 'YOU SANK THE WHOLE FLEET!';
      cls = 'green-win';
      if (firstFinish) {
        sound.win();
        celebrateChamp();
      }
    } else {
      text = 'THE HARBORMASTER RULES THE LAKE';
      cls = 'red-loss';
      if (firstFinish) sound.lose();
    }
  } else if (mode === 'online') {
    const iWon = winner === online.myPlayer;
    text = iWon
      ? 'YOU SANK THE WHOLE FLEET!'
      : `${opponentName().toUpperCase()} COMMANDS THE LAKE`;
    cls = `${COLORS[winner]}-win`;
    if (iWon) {
      if (firstFinish) {
        sound.win();
        celebrateChamp();
      }
    } else {
      if (firstFinish) sound.lose();
    }
  } else {
    text = `${CAPTAINS[winner]} COMMANDS THE LAKE!`;
    cls = `${COLORS[winner]}-win`;
    if (firstFinish) {
      sound.win();
      celebrateChamp();
    }
  }

  resultText.textContent = text;
  resultText.className = cls;
  clearTimeout(resultTimer);
  resultTimer = setTimeout(() => resultBar.classList.remove('hidden'), 900);
}

function celebrateChamp() {
  champBubble.textContent = pick(CHAMP_LINES);
  champEl.classList.add('hidden');
  void champEl.offsetWidth;
  champEl.classList.remove('hidden');
}

/* ------------------------------------------------------------- online play */
// Two phones share the engine state through js/rooms.js. Seat 0 is the host
// and maps to player 1, which is the side createInitialState() places and
// fires first. The full state reaches both friendly-game phones, but this UI
// only renders this phone's fleet and its legitimate view of enemy waters.

const GAME = 'battle-on-the-lake';
let panelIntent = 'host';

$('hostBtn').addEventListener('click', () => openPanel('host'));
$('joinBtn').addEventListener('click', () => openPanel('join'));
$('opCancel').addEventListener('click', closePanel);
$('opGo').addEventListener('click', onlineGo);
$('lobbyCancel').addEventListener('click', cancelLobby);
rejoinBtn.addEventListener('click', rejoinCrew);
opCode.addEventListener('input', () => {
  opCode.value = opCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});
[opName, opCode].forEach((el) => el.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') onlineGo();
}));

function openPanel(intent) {
  panelIntent = intent;
  opTitle.textContent = intent === 'host' ? 'START A CREW' : 'JOIN A CREW';
  $('opGo').textContent = intent === 'host' ? 'GET A CODE' : 'CROSS THE LAKE';
  opCodeWrap.classList.toggle('hidden', intent === 'host');
  opError.classList.add('hidden');
  opName.value = opName.value || getName();
  onlinePanel.classList.remove('hidden');
  (intent === 'join' && opName.value ? opCode : opName).focus();
}

function closePanel() {
  onlinePanel.classList.add('hidden');
}

const FRIENDLY_ERRORS = {
  not_found: 'No crew with that code — double-check the signal.',
  room_full: 'That crew already set sail without you.',
  room_started: 'That crew already set sail without you.',
  not_ready: "Online play isn't switched on yet — check back soon!",
  offline: "Can't reach the other shore — are you online?",
};

function friendly(err) {
  if (err?.code === 'wrong_game') {
    return `That code is for ${String(err.detail || 'another game').replace(/-/g, ' ')} — head there to use it.`;
  }
  return FRIENDLY_ERRORS[err?.code] || 'Choppy water — please try again.';
}

async function onlineGo() {
  if ($('opGo').disabled) return; // Enter key can't double-submit
  const name = opName.value.trim();
  if (!name) {
    opError.textContent = 'Every captain needs a name.';
    opError.classList.remove('hidden');
    opName.focus();
    return;
  }
  const go = $('opGo');
  go.disabled = true;
  opError.classList.add('hidden');
  try {
    if (panelIntent === 'host') {
      const match = await OnlineMatch.create({
        game: GAME,
        name,
        state: createInitialState({ seed: newSeed() }),
        seats: 2,
      });
      closePanel();
      openLobby(match);
    } else {
      const code = opCode.value.trim();
      if (code.length !== 4) {
        opError.textContent = 'The crew code is 4 characters.';
        opError.classList.remove('hidden');
        opCode.focus();
        return;
      }
      const match = await OnlineMatch.join({ game: GAME, code, name });
      closePanel();
      enterOnlineGame(match);
    }
  } catch (err) {
    opError.textContent = friendly(err);
    opError.classList.remove('hidden');
  } finally {
    go.disabled = false;
  }
}

function openLobby(match) {
  if (lobbyEl._match && lobbyEl._match !== match) lobbyEl._match.stop();
  lobbyCode.textContent = match.code;
  lobbyEl.classList.remove('hidden');
  match.start({
    onStatus: (status) => {
      if (status === 'playing') {
        lobbyEl.classList.add('hidden');
        enterOnlineGame(match);
      }
    },
    onError: () => {}, // a waiting-room hiccup can resolve on the next poll
  });
  lobbyEl._match = match;
}

function cancelLobby() {
  const match = lobbyEl._match;
  if (match) match.leave();
  lobbyEl._match = null;
  lobbyEl.classList.add('hidden');
  refreshRejoin();
}

async function rejoinCrew() {
  rejoinBtn.disabled = true;
  try {
    const match = await OnlineMatch.resume({ game: GAME });
    if (match.status === 'waiting') openLobby(match);
    else enterOnlineGame(match);
  } catch (err) {
    // Only a room that's truly gone forfeits the session — a flaky
    // connection must not delete the one path back to the game.
    if (err && (err.code === 'not_found' || err.code === 'not_seated' || err.code === 'room_started')) {
      clearSession(GAME);
      refreshRejoin();
    }
  } finally {
    rejoinBtn.disabled = false;
  }
}

function refreshRejoin() {
  const saved = savedSession(GAME);
  rejoinBtn.classList.toggle('hidden', !saved);
  if (saved) rejoinBtn.textContent = `↩ REJOIN YOUR CREW (${saved.code})`;
}

function enterOnlineGame(match) {
  clearTimers();
  resetDockButtons();
  mode = 'online';
  online = { match, myPlayer: match.seat === 0 ? P1 : P2 };
  state = match.state;
  view = online.myPlayer;
  busy = false;
  selected = null;
  targetSelection = null;
  pollErrors = 0;
  tally = { [P1]: 0, [P2]: 0 };
  countedFinishedState = null;
  resultBar.classList.add('hidden');
  champEl.classList.add('hidden');
  passBtn.classList.add('hidden');
  onlinePanel.classList.add('hidden');
  lobbyEl.classList.add('hidden');
  renderOnlineState();
  match.start({
    onState: onRemoteState,
    onStatus: onRemoteStatus,
    onPresence: onRemotePresence,
    onError: onPollError,
  });
  if (match.status === 'over' && !getStatus(state).over) renderOnlineAbandoned();
}

function canActOnline(player) {
  if (!online) return true;
  return online.match.status === 'playing' &&
    online.myPlayer === player &&
    state.turn === player;
}

function opponentName() {
  return online?.match.opponents()[0]?.name || 'THE OTHER CAPTAIN';
}

function renderOnlineState() {
  if (!online) return;
  const status = getStatus(state);
  view = online.myPlayer;
  passBtn.classList.add('hidden');

  if (online.match.status === 'over' && !status.over) {
    renderOnlineAbandoned();
    return;
  }

  if (status.phase === 'place') {
    targetSelection = null;
    resultBar.classList.add('hidden');
    champEl.classList.add('hidden');
    if (status.placing === online.myPlayer) {
      renderPlace();
      showScreen('place');
    } else {
      renderOnlineWait();
    }
    return;
  }

  showScreen('battle');
  if (status.over) {
    $('rematchBtn').classList.remove('hidden');
    finishGame();
    return;
  }

  renderBattle();
  resultBar.classList.add('hidden');
  champEl.classList.add('hidden');
  const last = status.last;
  if (!last) {
    statusLine.textContent = status.turn === online.myPlayer
      ? 'Tap a target to select it. Tap it again or press FIRE.'
      : `${opponentName()} has the first shot.`;
  } else if (last.player === online.myPlayer) {
    statusLine.textContent = `${coordName(last.row, last.col)} — ${describeOutgoing(last)}`;
  } else {
    statusLine.textContent = `${opponentName()} fired ${coordName(last.row, last.col)} — ${describeIncoming(last)}`;
  }
}

function renderOnlineWait() {
  cancelDrag();
  selected = null;
  onlineWaitTitle.textContent = `${opponentName().toUpperCase()} IS ANCHORING THEIR FLEET`;
  const opp = online.match.opponents()[0];
  onlineWaitSub.textContent = opp?.away
    ? 'Their signal has gone quiet. Your fleet remains hidden while we wait.'
    : 'Your waters stay private. Battle begins when the other shore is ready.';
  showScreen('onlineWait');
}

function renderOnlineAbandoned() {
  cancelDrag();
  busy = false;
  onlineWaitTitle.textContent = `${opponentName().toUpperCase()} LEFT THE LAKE`;
  onlineWaitSub.textContent = 'This campaign is over. Head back to the dock to start another.';
  showScreen('onlineWait');
}

function describeOutgoing(last) {
  if (last.sunk) return SUNK_LINES[last.sunk];
  if (last.result === 'hit') return 'HIT! Right in the hull.';
  return 'a miss. Just lake.';
}

function onRemoteState(newState) {
  // A cold repaint handles placement changes, shots, conflicts, resumes, and
  // rematches without ever diffing or briefly exposing the opponent's fleet.
  cancelDrag();
  state = newState;
  busy = false;
  selected = null;
  targetSelection = null;
  if (!getStatus(state).over) countedFinishedState = null;
  renderOnlineState();
}

function onRemoteStatus(status) {
  if (status === 'over' && !getStatus(state).over) renderOnlineAbandoned();
}

function onRemotePresence(opponents) {
  const opp = opponents[0];
  const recovered = pollErrors > 0;
  pollErrors = 0;
  if (opp?.left) {
    $('rematchBtn').classList.add('hidden');
    if (!getStatus(state).over) renderOnlineAbandoned();
    return;
  }
  if (recovered) {
    renderOnlineState();
  } else if (screens.onlineWait.classList.contains('hidden')) {
    if (getStatus(state).phase === 'battle') renderTurnChip();
  } else {
    renderOnlineWait();
  }
}

function onPollError(err) {
  if (err?.code === 'not_found') {
    online.match.stop();
    clearSession(GAME);
    online = null;
    mode = 'bot';
    showScreen('menu');
    refreshRejoin();
    return;
  }
  pollErrors++;
  if (pollErrors < 3 || getStatus(state).over) return;
  if (getStatus(state).phase === 'place') {
    placeHint.textContent = 'Choppy connection — holding your fleet here until the signal returns…';
  } else if (!screens.onlineWait.classList.contains('hidden')) {
    onlineWaitSub.textContent = 'Choppy connection — holding this course until the signal returns…';
  } else {
    turnChip.className = 'thinking';
    turnChip.textContent = 'CHOPPY CONNECTION — HANG TIGHT…';
  }
}

function publishOnlineMove() {
  if (!online) return;
  const match = online.match;
  const nextState = state;
  busy = true;
  renderOnlineState();

  (async () => {
    try {
      await match.push(nextState, { over: getStatus(nextState).over });
      pollErrors = 0;
    } catch (err) {
      if (err?.code === 'version_conflict') {
        state = match.state;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        if (!online || online.match !== match) return;
        try {
          await match.push(nextState, { over: getStatus(nextState).over });
          pollErrors = 0;
        } catch (retryErr) {
          if (retryErr?.code === 'version_conflict') state = match.state;
          else {
            state = match.state;
            onPollError(retryErr);
          }
        }
      }
    } finally {
      if (online?.match === match) {
        busy = false;
        renderOnlineState();
      }
    }
  })();
}

async function onlineRematch() {
  if (!online) return;
  const match = online.match;
  const fresh = createInitialState({ seed: newSeed() });
  state = fresh;
  busy = true;
  selected = null;
  targetSelection = null;
  countedFinishedState = null;
  resultBar.classList.add('hidden');
  champEl.classList.add('hidden');
  renderOnlineState();
  try {
    await match.push(fresh, {});
    pollErrors = 0;
  } catch (err) {
    if (err?.code === 'version_conflict') {
      state = match.state;
    } else {
      onPollError(err);
    }
  } finally {
    if (online?.match === match) {
      busy = false;
      renderOnlineState();
    }
  }
}

refreshRejoin();
