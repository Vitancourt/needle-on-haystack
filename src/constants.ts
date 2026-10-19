export const MOUND_RADIUS = 6;
export const MOUND_HEIGHT = 4;
export const GROUND_HALF = 40;
/** Half-width of the square barn floor; the player cannot leave it. */
export const BARN_HALF = 14;
/** Depth of the horse stalls along the +/-x walls, and how many per side. */
export const STALL_DEPTH = 3.6;
export const STALL_COUNT = 3;
export const BARN_WALL_HEIGHT = 7;
export const BARN_RIDGE_HEIGHT = 11;
/** Hanging lanterns: horizontal offset from the centre (both axes) and height. */
export const LANTERN_SPREAD = 7;
export const LANTERN_HEIGHT = 5.4;
export const EYE_HEIGHT = 1.7;
export const PLAYER_START_Z = MOUND_RADIUS + 4;
/** Closest the player may get to the pile's centre (horizontal). */
export const PLAYER_MIN_RADIUS = MOUND_RADIUS + 0.6;
export const PICK_DISTANCE = 7;

/** Height of the haystack surface at horizontal distance r from the centre. */
export function moundHeightAt(r: number): number {
  const t = Math.min(r / MOUND_RADIUS, 1);
  return MOUND_HEIGHT * (1 - t * t);
}
