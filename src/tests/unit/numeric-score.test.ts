import { expect, it } from "vitest";
import { numericScore } from "../../shared/analysis/numeric-score";
const clean = {
  watchers: 200,
  ageDays: 1,
  volume5mUsd: 200000,
  marketCapUsd: 400000,
  holderCount: 3000,
  holderGrowth: 1,
  top10Pct: 10,
  bundlersPct: 5,
  phishingPct: 5,
  bundlerProfitTop10: [],
  bundlerRankingComplete: true,
};
it("scores a complete runner out of 100", () =>
  expect(numericScore(clean)).toMatchObject({
    total: 100,
    coveredWeight: 100,
    lower: 100,
    upper: 100,
  }));
it("keeps veto independent from the score", () =>
  expect(numericScore({ ...clean, top10Pct: 22 }).assessment.vetoes).toContain(
    "TOP10_22",
  ));
it("does not publish a complete score when required holder growth is unknown", () =>
  expect(numericScore({ ...clean, holderGrowth: null }).total).toBeNull());
it("does not turn missing data into zero or a full score", () => {
  const r = numericScore({ top10Pct: 10 });
  expect(r.total).toBeNull();
  expect(r.coveredWeight).toBe(20);
  expect(r.lower).toBe(0);
  expect(r.upper).toBe(100);
});
it("deducts only unrealized ROI with a positive remainder", () => {
  const r = numericScore({
    ...clean,
    bundlerProfitTop10: [
      { address: "a", remainingTokens: 1, unrealizedRoiPct: 1000.01 },
      { address: "b", remainingTokens: 0, unrealizedRoiPct: 9999 },
    ],
  });
  expect(r.total).toBe(98);
});
it("does not give full holder points at the strict threshold", () =>
  expect(numericScore({ ...clean, holderCount: 1000 }).total).toBe(95));
it("uses a slowcook volume threshold and Total Fees", () =>
  expect(
    numericScore({
      ...clean,
      ageDays: 7,
      volume5mUsd: 100000,
      previousHourVolumeUsd: 1200000,
      marketCapUsd: 2000000,
      holderCount: 6000,
      totalFeesSolEquivalent: 400,
    }),
  ).toMatchObject({ total: 100 }));
it.each([
  [99, -10, "red"],
  [100, -5, "low"],
  [199, -5, "low"],
  [200, 0, "normal"],
  [400, 0, "normal"],
  [401, 5, "high"],
] as const)("watchers boundary %i", (watchers, adjustment, status) => {
  const r = numericScore({ ...clean, watchers, volume5mUsd: 100000 });
  expect(r.watchers).toMatchObject({ adjustment, status });
  expect(r.total).toBe(88 + adjustment);
  expect(r.assessment.vetoes).toEqual([]);
});
it("unknown watchers prevent a complete score and widen its interval", () => {
  const r = numericScore({ ...clean, watchers: null });
  expect(r.total).toBeNull();
  expect(r.lower).toBe(90);
  expect(r.upper).toBe(100);
});
it("watcher bonus cannot exceed 100 or cancel veto", () => {
  expect(numericScore({ ...clean, watchers: 401 }).total).toBe(100);
  expect(
    numericScore({ ...clean, watchers: 401, top10Pct: 22 }).assessment.vetoes,
  ).toContain("TOP10_22");
});
