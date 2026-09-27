import { describe, it, expect } from "vitest";
import { metricTone } from "../../renderer/lib/metric-tone";
describe("numeric metric colour severity", () => {
  it("grades the user examples without changing veto thresholds", () => {
    const mild = metricTone("top10Pct", 17.9),
      severe = metricTone("top10Pct", 45);
    expect(mild.kind).toBe("bad");
    expect(severe.kind).toBe("bad");
    expect(severe.strength).toBeGreaterThan(mild.strength);
    expect(metricTone("bundlersPct", 9).kind).toBe("good");
    expect(metricTone("bundlersPct", 5).strength).toBeGreaterThan(
      metricTone("bundlersPct", 9).strength,
    );
    expect(metricTone("phishingPct", 26).kind).toBe("bad");
    expect(metricTone("top10Pct", 15).kind).toBe("neutral");
  });
  it("keeps missing data and unspecified rules neutral", () => {
    for (const v of [null, undefined, NaN, -1])
      expect(metricTone("top10Pct", v).kind).toBe("neutral");
    expect(metricTone("snipersPct", 0).kind).toBe("neutral");
    expect(metricTone("volume5mUsd", 75000).kind).toBe("neutral");
    expect(metricTone("totalFeesSolEquivalent", 1000).kind).toBe("neutral");
  });
  it("applies mode-dependent rules and watcher boundaries", () => {
    expect(metricTone("volume5mUsd", 75000, { mode: "runner" }).kind).toBe(
      "bad",
    );
    expect(metricTone("volume5mUsd", 75000, { mode: "slowcook" }).kind).toBe(
      "good",
    );
    expect(
      metricTone("holderCount", 1000, { mode: "runner", marketCapUsd: 400000 })
        .kind,
    ).toBe("neutral");
    expect(
      metricTone("holderCount", 3001, {
        mode: "slowcook",
        marketCapUsd: 2000000,
      }).kind,
    ).toBe("good");
    expect(metricTone("watchers", 99).strength).toBeGreaterThan(
      metricTone("watchers", 150).strength,
    );
    expect(metricTone("watchers", 200).kind).toBe("neutral");
    expect(metricTone("watchers", 400).kind).toBe("neutral");
    expect(metricTone("watchers", 600).kind).toBe("good");
  });
});
it("hourly volume uses twelvefold boundaries and identical colour strength", () => {
  for (const mode of ["runner", "slowcook"] as const)
    for (const value of [
      0, 24999, 25000, 40000, 50000, 79999, 80000, 100000, 100001, 200000,
    ]) {
      const five = metricTone("volume5mUsd", value, { mode }),
        hour = metricTone("volume1hUsd", value * 12, { mode });
      expect({
        kind: hour.kind,
        strength: hour.strength,
        redFlag: hour.redFlag,
      }).toEqual({
        kind: five.kind,
        strength: five.strength,
        redFlag: five.redFlag,
      });
    }
});
