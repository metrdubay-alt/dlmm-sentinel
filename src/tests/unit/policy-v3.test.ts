import { it, expect } from "vitest";
import { metricTone } from "../../renderer/lib/metric-tone";
import {
  classifyStrategy,
  assessStrategy,
} from "../../shared/analysis/strategy";
it("applies revised zones and strict red flag boundaries", () => {
  for (const key of ["top10Pct", "bundlersPct", "phishingPct"]) {
    expect(metricTone(key, 9.99).kind).toBe("good");
    expect(metricTone(key, 10).kind).toBe("neutral");
  }
  for (const key of ["bundlersPct", "phishingPct"]) {
    expect(metricTone(key, 15).kind).toBe("neutral");
    expect(metricTone(key, 15.01).kind).toBe("bad");
  }
  for (const [mode, red, end, green] of [
    ["runner", 50000, 80000, 100000],
    ["slowcook", 25000, 40000, 50000],
  ] as const) {
    expect(metricTone("volume5mUsd", red - 1, { mode }).redFlag).toBe(true);
    expect(metricTone("volume5mUsd", red, { mode }).redFlag).toBe(false);
    expect(metricTone("volume5mUsd", end, { mode }).kind).toBe("neutral");
    expect(metricTone("volume5mUsd", green, { mode }).kind).toBe("neutral");
    expect(metricTone("volume5mUsd", green + 1, { mode }).kind).toBe("good");
  }
  for (const [cap, red, green] of [
    [300000, 1000, 1500],
    [1000000, 1000, 1500],
    [1000001, 1800, 3000],
  ]) {
    expect(
      metricTone("holderCount", red - 1, { marketCapUsd: cap }).redFlag,
    ).toBe(true);
    expect(metricTone("holderCount", red, { marketCapUsd: cap }).kind).toBe(
      "neutral",
    );
    expect(metricTone("holderCount", green, { marketCapUsd: cap }).kind).toBe(
      "neutral",
    );
    expect(
      metricTone("holderCount", green + 1, { marketCapUsd: cap }).kind,
    ).toBe("good");
  }
  expect(
    metricTone("totalFeesSolEquivalent", 99, { mode: "slowcook" }).redFlag,
  ).toBe(true);
  expect(
    metricTone("totalFeesSolEquivalent", 100, { mode: "slowcook" }).redFlag,
  ).toBe(false);
  expect(
    metricTone("totalFeesSolEquivalent", 150, { mode: "slowcook" }).kind,
  ).toBe("neutral");
  expect(
    metricTone("totalFeesSolEquivalent", 200, { mode: "slowcook" }).kind,
  ).toBe("neutral");
  expect(
    metricTone("totalFeesSolEquivalent", 201, { mode: "slowcook" }).kind,
  ).toBe("good");
});
it("recommends slowcook solely by age and cap; combined exposure is a flag", () => {
  expect(classifyStrategy({ ageDays: 5, marketCapUsd: 2000000 }).mode).toBe(
    "runner",
  );
  expect(classifyStrategy({ ageDays: 5.01, marketCapUsd: 1000001 }).mode).toBe(
    "slowcook",
  );
  expect(classifyStrategy({ ageDays: 50, marketCapUsd: 1000000 }).mode).toBe(
    "runner",
  );
  expect(classifyStrategy({ ageDays: 50 }).mode).toBe("unknown");
  const r = assessStrategy({
    ageDays: 1,
    marketCapUsd: 500000,
    bundlersPct: 30,
    phishingPct: 21,
    volume5mUsd: 49999,
    holderCount: 999,
  });
  expect(r.redFlags).toContain("COMBINED_50");
  expect(r.vetoes).not.toContain("COMBINED_50");
  expect(r.redFlags).toContain("VOLUME_RED");
  expect(r.redFlags).toContain("HOLDERS_RED");
});
import { tokenAgeDays } from "../../shared/analysis/gmgn";
it("reads local GMGN creation time and rejects invalid or future dates", () => {
  const created = new Date(2026, 8, 17, 4, 57, 12);
  const observed = new Date(created.getTime() + 6 * 86400000).toISOString();
  expect(tokenAgeDays("09/17/2026 04:57:12", observed)).toBe(6);
  expect(tokenAgeDays("02/30/2026 04:57:12", observed)).toBeNull();
  expect(tokenAgeDays("unknown", observed)).toBeNull();
  expect(tokenAgeDays("2026-10-01T00:00:00Z", observed)).toBeNull();
  expect(tokenAgeDays("2026-09-17T00:00:00Z", "2026-09-23T00:00:00Z")).toBe(6);
});
it("does not cross a cap boundary on ambiguous rounded values", () => {
  expect(
    classifyStrategy({
      ageDays: 6,
      marketCapRange: { lower: 990000, upper: 1010000 },
    }).mode,
  ).toBe("unknown");
  expect(
    classifyStrategy({
      ageDays: 6,
      marketCapRange: { lower: 23640000, upper: 23660000 },
    }).mode,
  ).toBe("slowcook");
  expect(
    metricTone("holderCount", 1900, {
      marketCapRange: { lower: 990000, upper: 1010000 },
    }).kind,
  ).toBe("neutral");
});
