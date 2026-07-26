# BATTLE ON THE LAKE ⚓💥

Classic pencil-and-paper naval guesswork, Burlington style: hide a fleet of
five Lake Champlain vessels — the **Ferry**, the **Schooner**, the **Coast
Guard Cutter**, the **Sailboat** and the **Kayak** — somewhere in your
waters, then call your shots and sink the other shore's fleet before they
find yours. A game for [Btown Games](https://play.btownbrief.com/), the
browser arcade of the [BTown Brief](https://www.btownbrief.com).

**Play it live:** https://play.btownbrief.com/battle-on-the-lake/

## Modes

- **Vs. the Harbormaster** ⚓ — the default. The bot scatters a legal fleet,
  hunts the checkerboard until it draws blood, then works the wound until the
  vessel goes down. It never repeats a shot.
- **Pass & play** 📱 — two admirals, one phone. A full-screen "hand over the
  phone" blocker sits between every turn so neither captain ever sees the
  other shore's waters.

## How to play

Drag each vessel onto your 10×10 stretch of lake (rotate and re-drag freely,
or hit **scatter fleet** for a random legal layout), then trade one shot per
turn. The defender reports **hit** or **miss**, and announces every sinking
by name. Sink all five vessels to command the lake.

## How it works

Plain static site — no build step, no frameworks, no npm. `index.html` +
`style.css` + ES modules in `js/`:

| file | what it does |
| --- | --- |
| `js/engine.js` | **all** the rules — placement, shots, sinkings, wins — as pure functions over a plain JSON state object; see the rule below |
| `js/bot.js` | the Harbormaster's hunt/target brain; only ever calls the engine's public API and sees exactly what a human attacker would |
| `js/main.js` | UI only: drag-to-place dock, the pass-and-play blocker, battle screens, session tally |
| `js/audio.js` | procedural WebAudio splashes, thuds and foghorns, no audio files |

Every push to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## The engine rule (the one non-negotiable)

The future online version will keep each player's board **server-side** so
nobody can peek. That only works if every placement and every shot flows
through `js/engine.js`:

- `createInitialState(options)`, `legalMoves(state)`, `applyMove(state, move)`
  (returns a NEW state, never mutates), `getStatus(state)`.
- `engine.js` imports nothing and never touches the DOM, timers, `Date`, or
  `Math.random` — the fleet scatter uses a seeded RNG whose seed lives in the
  state.
- The whole game survives `JSON.stringify` → `JSON.parse` → resume.

If you add a rule anywhere else, you've broken the online plan.

## Testing

```bash
node scripts/test-engine.mjs
```

Plain Node, no test framework. Covers placement legality (overlaps, edges),
hit/miss/sunk-by-name/win detection, no-repeat shots, immutability, the JSON
round trip, deterministic seeded scattering, and the Harbormaster: it
finishes a wounded vessel in a crafted position and never repeats a shot
across a full simulated war.

## Regenerating the app icon

`icon-180.png` is rendered from `icon.svg` (give the copy an explicit size
first — headless Chrome won't scale a bare viewBox):

```bash
sed 's/<svg xmlns/<svg width="180" height="180" xmlns/' icon.svg > /tmp/icon-180.svg
chrome --headless --screenshot=icon-180.png --window-size=180,180 --default-background-color=00000000 "file:///tmp/icon-180.svg"
```
