import { describe, expect, it } from "vitest";
import { applyFabriqFees, poolFeeTone } from "../../shared/analysis/pool-fees";
import type { PoolRow } from "../../shared/analysis/pool-snapshot";

const row = (address: string): PoolRow => ({
  address,
  name: "TEST / SOL",
  dex: "fixture",
  tvlUsd: 10_000,
  feePct: 1,
  feeSource: "field",
  volume5mUsd: 1_000,
  volume1hUsd: 12_000,
  sum5mUsd: 1_000,
  sum1hUsd: 12_000,
  efficiency5m: 0.1,
  efficiency1h: 1.2,
  issue: "",
});

describe("actual Fabriq five-minute pool fees", () => {
  it("matches only a full exact pool address and retains partial coverage", () => {
    const matched = "11111111111111111111111111111111";
    const other = "22222222222222222222222222222222";
    const rows = applyFabriqFees([row(matched), row(other)], [
      { address: matched, fees5mUsd: 530.88 },
      { address: "33333333333333333333333333333333", fees5mUsd: 999 },
    ]);

    expect(rows).toMatchObject([
      { address: matched, fabriqFees5mUsd: 530.88, fabriqMatch: "matched" },
      { address: other, fabriqFees5mUsd: null, fabriqMatch: "missing" },
    ]);
  });

  it("keeps the agreed Runner thresholds exact", () => {
    expect(poolFeeTone(149.99, "runner")).toMatchObject({
      kind: "bad",
      redFlag: true,
    });
    expect(poolFeeTone(150, "runner")).toMatchObject({
      kind: "bad",
      redFlag: false,
    });
    expect(poolFeeTone(300, "runner").kind).toBe("neutral");
    expect(poolFeeTone(450, "runner").kind).toBe("neutral");
    expect(poolFeeTone(450.01, "runner").kind).toBe("good");
  });

  it("shows an amount but no Runner verdict in another profile", () => {
    expect(poolFeeTone(900, "slowcook")).toMatchObject({ kind: "neutral" });
  });
});
