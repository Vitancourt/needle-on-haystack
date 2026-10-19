# Needle on Haystack

A first-person browser game built with three.js: walk around a haystack and find the hidden needle before the timer runs out. Each level adds more hay, a smaller needle, lower contrast, a deeper hiding spot and less time.

**Modes** (chosen from the main menu): *Static haystack* is a solid pile you search by eye. *Movable haystack* simulates every strand with [Rapier](https://rapier.rs) physics: click hay to pick it up, click again to drop it anywhere in the barn, and click the needle to win.

**Controls:** WASD walk · Shift sprint · mouse look · click to grab the needle · Esc pause · M mute.
A faint glint appears near the needle if you've been searching for a while. Your best level and times are saved in `localStorage`.

## Run with Docker (no local Node needed)

| Command | What it does |
|---|---|
| `docker compose up --build dev` (or `make up`) | Vite dev server with hot reload at http://localhost:5173 |
| `docker compose --profile prod up --build prod` (or `make prod`) | Production build served by nginx at http://localhost:8080 |
| `make down` / `make logs` | Stop / follow logs |

Versions are pinned in one place each: Node and nginx in `Dockerfile`, three.js in `package-lock.json`.

## Run locally

```sh
npm ci
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
```

## Deploy

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main` (enable Pages with the "GitHub Actions" source in the repo settings). The build reads `VITE_BASE` so the same code works at `/` and `/<repo>/`.

## Layout

`src/main.ts` bootstrap and render loop · `scene.ts` renderer, camera, lights, ground · `haystack.ts` instanced hay · `needle.ts` needle, placement, picking, hint · `controls.ts` first-person movement · `game.ts` state machine, modes, levels, timer · `physicsHay.ts` rigid-body hay for the movable mode (the settled pile is pre-baked in `assets/pile.bin`; regenerate it with `bakePile()` from that file if the strand size changes) · `levels.ts` difficulty curve · `hud.ts` DOM overlays · `audio.ts` procedural sound · `storage.ts` saved scores.

Design docs: `docs/PRD.md` and `docs/plan/`.
