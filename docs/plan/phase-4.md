# Phase 4: Polish & Deploy (PRD milestone M4)

**Goal:** a tuned, shippable game on a public static URL.

## Tasks
1. Difficulty tuning: playtest and adjust the `levelConfig` curve so levels 1–5 are neither trivial nor impossible. Decide whether level 1 shows the needle as a tutorial.
2. P1 features, in priority order:
   - Hint glint near the needle after N seconds.
   - Best time and highest level saved in `localStorage`, with try/catch around access.
   - Sound effects and ambient audio, with a mute toggle.
3. Performance pass: adaptive hay count if the frame rate drops, a test on low-end integrated graphics, and checks of the draw call and payload budgets (under 150 draw calls, under 10 MB).
4. Compatibility pass: Chrome, Firefox, Safari and Edge, with extra attention to Safari pointer lock.
5. Accessibility pass: HUD contrast and no flashing effects.
6. Deploy: a Vite production build (`npm run build`), with a GitHub Pages workflow (set `base` in `vite.config.ts`). Add a README with run and build instructions.

## Deliverables
- A public URL hosting the game and a README.

## Acceptance criteria
- All PRD success criteria are met: under 5 seconds to playable, 60 fps, 1–3 minutes per level.
- The production build works from the deployed URL on all four target browsers.

## Depends on
Phase 3.
