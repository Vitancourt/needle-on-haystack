export interface Save {
  highestLevel: number;
  bestTimes: Record<string, number>;
  muted: boolean;
}

const KEY = 'needle-on-haystack:v1';

export function loadSave(): Save {
  const fallback: Save = { highestLevel: 0, bestTimes: {}, muted: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<Save>) };
  } catch {
    return fallback;
  }
}

export function writeSave(save: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage may be blocked (private mode); the game works without it.
  }
}
