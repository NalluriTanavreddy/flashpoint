# Flashpoint

A browser-based top-down FPS game built with pure HTML, JavaScript, and Canvas. No frameworks required.

## How to Play

- **WASD** — Move
- **Mouse** — Aim
- **Left Click** — Shoot
- **R** — Reload (future)

## Features

- Stick figure enemies with HP bars (2 hits to kill)
- Ammo system: start with 7, gain +3 per kill
- Level progression: 3 kills to clear Level 1, +2 enemies per level
- Randomised map layouts with green crates and orange barrels each level
- 5 randomised spawn points per level
- Scoring: points per kill + time bonus + accuracy percentage
- Persistent stats via localStorage: high score, best level, total kills, accuracy

## Deployment

Deploy instantly to Vercel — see `vercel.json`.

## Local Development

Open `index.html` directly in a browser, or serve with any static server:

```bash
npx serve .
```
