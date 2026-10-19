# Phase 3: Game Loop & Levels (PRD milestone M3)

**Goal:** a complete playable game: timer, levels, win and lose flow.

## Tasks
1. `src/game.ts`: state machine with `menu`, `playing`, `paused`, `won` and `lost` states, and a single place for transitions.
2. Level config: a function `levelConfig(n)` returning the hay count, needle size, needle contrast, needle depth and time limit. The time limit has a floor.
3. Timer: a countdown that runs only in `playing`. Resolve the open question of whether it pauses when pointer lock is lost (recommended: yes, move to `paused`).
4. `src/hud.ts`: DOM overlays for the timer, the level indicator, the start menu, the level-complete screen (with time taken) and the game-over screen (with level reached and a Retry button).
5. Level rebuild: dispose of the old hay and needle geometry and build the next level from a new seed, with no memory leaks across levels.
6. Pause on Esc and resume on click.

## Deliverables
- A full run: menu, level 1, level 2 and so on, until the timer expires, then game over and retry.

## Acceptance criteria
- Levels measurably get harder (the config values change monotonically).
- Memory stays flat over 10 consecutive level rebuilds (check `renderer.info.memory`).
- The timer never ticks while paused or in a menu.
- Retry restarts from level 1.

## Depends on
Phase 2.
