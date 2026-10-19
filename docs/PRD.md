# Needle on Haystack: Product Requirements Document

## 1. Overview & Goals
Needle on Haystack is a simple first-person 3D browser game built with three.js. The player walks around a big haystack and searches for a hidden needle before a timer runs out. Each level makes the search harder.

**Success criteria**
- Loads and becomes playable in under 5 seconds on a broadband connection.
- Holds 60 fps on a mid-range laptop with an integrated GPU.
- A single level takes roughly 1–3 minutes.
- Zero install: runs from a static URL.

## 2. Target Users & Platforms
- Casual players looking for a quick, replayable challenge.
- Desktop browsers: current Chrome, Firefox, Safari and Edge.
- Touch and mobile are out of scope for v1, since controls rely on keyboard and pointer lock.

## 3. Core Gameplay Loop
1. **Start screen**: title, short instructions, "Play" button (requests pointer lock).
2. **Search**: walk (WASD) and look (mouse) around the haystack. A countdown timer is shown on the HUD.
3. **Find**: aim at the needle and click to pick it up.
4. **Win level**: show the time taken, then advance to the next, harder level.
5. **Lose**: if the timer reaches zero, show a game-over screen with the level reached and a Retry button.

## 4. Level & Difficulty Design
Each level increases difficulty along these axes:
- More hay strands (denser pile).
- Smaller needle.
- Lower colour contrast between needle and hay.
- Needle placed deeper in the pile or at awkward angles.
- Slightly shorter timer, with a sensible floor.

Needle placement is seeded random, so a level's seed can be replayed or shared. An optional hint (a faint glint near the needle after N seconds) is a P1 feature.

## 5. Functional Requirements

### P0 (must have)
- 3D scene: ground plane, lighting, sky or background, and a haystack mound built from instanced hay strands.
- Needle mesh, hidden within the haystack.
- First-person controls: pointer lock, WASD movement, mouse look, collision so the player can't walk through the pile or off the map.
- Raycast-based picking on click, with a maximum interaction distance.
- Countdown timer HUD and current level indicator.
- Level progression and a game state machine (menu, playing, won, lost).
- Win and lose screens with restart.
- Esc pauses (pointer lock release) and resumes.

### P1 (nice to have)
- Sound effects and ambient audio.
- Best time and highest level saved in `localStorage`.
- Hint glint after a delay.
- Mobile touch controls.

## 6. Technical Approach
- **Stack**: Vite + three.js, vanilla TypeScript. Static build, deployable to GitHub Pages or any static host.
- **Hay rendering**: a single `InstancedMesh` of thin strand geometry, with per-instance transform and colour variation, so thousands of strands cost one draw call.
- **Controls**: three.js `PointerLockControls` plus a simple custom WASD movement loop.
- **Picking**: `THREE.Raycaster` from the screen centre, checked against the needle mesh only (hay is excluded), which keeps picking cheap.
- **Randomness**: a small seeded PRNG for reproducible level generation.
- **Proposed modules** (`src/`):
  - `main.ts`: bootstrap and render loop
  - `scene.ts`: renderer, camera, lights, ground
  - `haystack.ts`: instanced hay generation
  - `needle.ts`: needle mesh and placement
  - `controls.ts`: first-person movement
  - `game.ts`: state machine, levels, timer
  - `hud.ts`: DOM overlays (timer, level, menus)

## 7. Non-Functional Requirements
- **Performance**: under 150 draw calls and 60 fps target; scale hay count to device capability if frame rate drops.
- **Assets**: procedural geometry only for v1, with total payload under 10 MB.
- **Accessibility**: readable HUD contrast, Esc to pause, no flashing effects.
- **Compatibility**: WebGL2 required, with a friendly message when it's unavailable.

## 8. Milestones
| Milestone | Scope |
|---|---|
| M1 | Vite project, scene, haystack, first-person controls |
| M2 | Needle placement, raycast picking, win detection |
| M3 | Timer, game state machine, level progression, menus |
| M4 | Polish (audio, hint, best-score), tuning, deploy |

## 9. Risks & Open Questions
- Instanced hay may be slow on integrated GPUs. Mitigation: adaptive hay count and a performance test on low-end hardware.
- Difficulty balance: the needle may be impossibly hidden or trivially easy. Mitigation: playtest and tune per-level parameters, and add the hint.
- Pointer-lock behaviour varies across browsers (especially Safari). Needs early testing.
- Resolved: level 1 has no tutorial needle; the hint glint appears after a delay on every level.
- Resolved: the timer pauses (game state `paused`) whenever pointer lock is lost.

## 10. Out of Scope (v1)
- Multiplayer, leaderboards, accounts, or any backend.
- Mobile and touch controls.
- External 3D models or textures.
