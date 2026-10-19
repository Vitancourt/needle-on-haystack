# Phase 2: Needle & Picking (PRD milestone M2)

**Goal:** a hidden needle the player can find and pick up.

## Tasks
1. `src/needle.ts`: needle mesh (thin metallic cylinder with a cone tip) with size and colour parameters.
2. Placement: choose a seeded-random position inside the pile, with a depth parameter and a random orientation. Ensure the needle is reachable and at least partly visible from some angle.
3. Picking: a `THREE.Raycaster` from the screen centre on click, tested against the needle mesh only, with a maximum interaction distance.
4. A crosshair in the DOM and a basic "found it" event that the game layer can listen to.
5. Keep needle parameters in a single config object so Phase 3 can scale them per level.

## Deliverables
- Clicking the needle within range fires a `needleFound` event. Clicking elsewhere does nothing.

## Acceptance criteria
- The same seed always produces the same needle position and orientation.
- Hay never blocks the pick ray, because the raycast ignores it.
- The needle is findable by an attentive player at default settings.

## Depends on
Phase 1.
