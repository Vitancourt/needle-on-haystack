export interface LevelConfig {
  level: number;
  seed: number;
  hayCount: number;
  needleLength: number;
  needleRadius: number;
  /** 1 = clearly metallic against the hay, 0 = same colour as hay. */
  needleContrast: number;
  /** How far below the hay surface the needle sits (metres). */
  needleDepth: number;
  /** Seconds before the hint glint appears. */
  hintDelay: number;
}

export function levelConfig(level: number, runSeed: number): LevelConfig {
  const n = level - 1;
  const needleLength = Math.max(0.18, 0.7 * Math.pow(0.88, n));
  return {
    level,
    seed: (runSeed + level * 7919) >>> 0,
    hayCount: Math.min(30000 + n * 6000, 90000),
    needleLength,
    needleRadius: Math.max(0.006, needleLength * 0.035),
    needleContrast: Math.max(0.15, 1 - 0.14 * n),
    needleDepth: Math.min(0.7, 0.05 + 0.1 * n),
    hintDelay: Math.max(12, 30 - 2 * n),
  };
}
