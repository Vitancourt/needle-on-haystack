# Phase 1: Foundation (PRD milestone M1)

**Goal:** a walkable 3D haystack scene running on a Vite + three.js project.

## Tasks
1. Scaffold the Vite vanilla-TS project (`package.json`, `tsconfig.json`, `index.html`, `src/`), add `three` and `@types/three`, and add a `.gitignore`.
2. `src/scene.ts`: renderer (resize handling, pixel-ratio cap), perspective camera, lights, sky/background, ground plane.
3. `src/haystack.ts`: seeded PRNG helper plus a haystack mound built from one `InstancedMesh` of thin strands, with per-instance transform and colour variation. The hay count is a parameter.
4. `src/controls.ts`: `PointerLockControls` plus a WASD movement loop with delta-time movement, a bounds clamp, and a collision radius around the pile.
5. `src/main.ts`: bootstrap and render loop. Add a minimal click-to-lock overlay and a WebGL2-unavailable message.

## Deliverables
- `npm run dev` shows a haystack the player can walk around in first person.

## Acceptance criteria
- 60 fps with the default hay count on a mid-range laptop.
- The player cannot walk through the pile or off the map.
- The draw call count is under 150 (check `renderer.info`).
- Esc releases pointer lock and a click resumes.

## Depends on
Nothing.
