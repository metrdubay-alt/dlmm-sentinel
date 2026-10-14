import { describe, expect, it } from "vitest";
import { calculateFeeVolume, feeVolumeTone } from "../../shared/analysis/fee-volume";

describe("GMGN Total Fees / all-time chart volume", () => {
  it("converts native Total Fees to USD before dividing by chart volume", () => {
    const result = calculateFeeVolume({
      totalFeesNative: 376.03,
      nativeUsd: 140,
      volumeUsd: 13_900_000,
    });
    expect(result).toMatchObject({ feesUsd: 52_644.2, volumeUsd: 13_900_000 });
    expect(result?.percent).toBeCloseTo(0.3787352517985612, 12);
  });

  it("does not fabricate a percentage when either source is unavailable", () => {
    expect(
      calculateFeeVolume({ totalFeesNative: null, nativeUsd: 140, volumeUsd: 1 }),
    ).toBeNull();
    expect(
      calculateFeeVolume({ totalFeesNative: 1, nativeUsd: null, volumeUsd: 1 }),
    ).toBeNull();
    expect(
      calculateFeeVolume({ totalFeesNative: 1, nativeUsd: 140, volumeUsd: 0 }),
    ).toBeNull();
  });

  it("keeps the agreed percentage boundaries exact", () => {
    expect(feeVolumeTone(0.3499)).toMatchObject({ kind: "bad", redFlag: true });
    expect(feeVolumeTone(0.35)).toMatchObject({ kind: "bad", redFlag: false });
    expect(feeVolumeTone(0.5).kind).toBe("neutral");
    expect(feeVolumeTone(0.75).kind).toBe("neutral");
    expect(feeVolumeTone(0.7501).kind).toBe("good");
  });
});
