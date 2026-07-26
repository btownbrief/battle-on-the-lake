# Battle on the Lake — agent instructions

Shared brain for any AI agent working in this repo (Codex, Claude Code, etc.).
Read `README.md` first for the architecture — this file adds the rules an
agent needs. Stephen is non-technical — explain consequential changes in
plain language.

## What this is

Btown's take on classic pencil-and-paper naval guesswork: hide five Lake
Champlain vessels on a 10×10 grid, call shots, sink the other shore first.
Original name and art throughout — never use the trademarked "Battleship"
name or its look. Plain static site, **no build step**: `index.html` +
`style.css` + ES modules in `js/`. Deployed by GitHub Pages via
`.github/workflows/deploy.yml` on push. No backend, no accounts, no
analytics.

## The one non-negotiable

Every game rule lives in `js/engine.js` as pure functions over a plain
JSON-serializable state object. `engine.js` imports nothing and never touches
the DOM, timers, `Date`, or `Math.random` — the only randomness (scattering a
fleet) uses a seeded RNG whose seed lives in the state. `applyMove` returns a
**new** state. The future online version keeps each player's board
server-side so nobody can peek, which only works if every placement and shot
flows through the engine — rule logic anywhere else (main.js, bot.js) breaks
that plan. `js/bot.js` may only call the engine's public API and must learn
about the enemy only through `shotResult` — exactly what a human attacker
knows. `js/main.js` is UI only.

## Pass-and-play secrecy

The "hand the phone over" blocker is a first-class feature, not a nicety.
Any change to screen flow must keep this true: the next player's boards are
never rendered until they tap through the blocker.

## Before you finish

Run `node scripts/test-engine.mjs` — it must pass. If you touched the UI,
playtest a full game (placement, both modes, a sinking, a win) at a
phone-sized viewport, or clearly say you couldn't and what you inspected
instead. Say what you verified.
