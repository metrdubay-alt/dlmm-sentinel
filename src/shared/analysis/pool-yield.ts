import { z } from "zod";

const candleSchema = z.object({
  timestamp: z.number().int().nonnegative().multipleOf(60),
  volumeUsd: z.number().finite().nonnegative(),
});
export type MinuteVolume = z.infer<typeof candleSchema>;

/** Completed-minute arithmetic. GeckoPools.gs pads only the trailing interval
 * after the latest returned candle; leading/internal gaps remain unknown.
 * endEpochSeconds is the exclusive completed-minute boundary, not request time.
 */
export function sumMinuteVolume(
  candles: MinuteVolume[],
  endEpochSeconds: number,
  minutes: 5 | 60,
  padTrailingEmptyIntervals = false,
): number | null {
  z.number().int().nonnegative().multipleOf(60).parse(endEpochSeconds);
  z.union([z.literal(5), z.literal(60)]).parse(minutes);
  const start = endEpochSeconds - minutes * 60;
  const byTime = new Map<number, number>();
  let latest = -Infinity;
  for (const item of candles) {
    const c = candleSchema.parse(item);
    if (c.timestamp >= endEpochSeconds) continue;
    latest = Math.max(latest, c.timestamp);
    if (c.timestamp < endEpochSeconds - 3600) continue;
    if (byTime.has(c.timestamp) && byTime.get(c.timestamp) !== c.volumeUsd)
      return null;
    byTime.set(c.timestamp, c.volumeUsd);
  }
  let sum = 0;
  for (let t = start; t < endEpochSeconds; t += 60) {
    const volume = byTime.get(t);
    if (volume === undefined) {
      if (padTrailingEmptyIntervals && latest !== -Infinity && t > latest)
        continue;
      return null;
    }
    sum += volume;
  }
  return Number.isFinite(sum) ? sum : null;
}

const poolInputSchema = z.object({
  feeFraction: z.number().finite().min(0).max(1).nullable(),
  volumeUsd: z.number().finite().nonnegative().nullable(),
  totalTvlUsd: z.number().finite().nonnegative().nullable(),
  activeTvlUsd: z.number().finite().nonnegative().nullish(),
  denominator: z.enum(["total", "active"]),
});
/** Rate × historical volume is an estimate, not actual earned LP fees. */
export function estimatePoolYield(input: z.input<typeof poolInputSchema>) {
  const x = poolInputSchema.parse(input);
  const denominator =
    x.denominator === "active" ? x.activeTvlUsd : x.totalTvlUsd;
  const raw =
    denominator != null &&
    denominator > 0 &&
    x.feeFraction != null &&
    x.volumeUsd != null
      ? x.feeFraction * (x.volumeUsd / denominator) * 100
      : null;
  return {
    eligible: x.totalTvlUsd == null ? null : x.totalTvlUsd >= 50000,
    percent: raw != null && Number.isFinite(raw) ? raw : null,
    denominator: x.denominator,
    estimated: true as const,
  };
}
