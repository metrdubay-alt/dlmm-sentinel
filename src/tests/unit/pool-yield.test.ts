import { describe, expect, it } from "vitest";
import {
  estimatePoolYield,
  sumMinuteVolume,
} from "../../shared/analysis/pool-yield";
const candles = Array.from({ length: 60 }, (_, i) => ({
  timestamp: i * 60,
  volumeUsd: 100,
}));
describe("перенос расчёта пулов", () => {
  it("Gecko: pads only minutes after the last candle, as gcVolumes_ does", () => {
    const sparseTail = candles.slice(0, 46);
    expect(sumMinuteVolume(sparseTail, 3600, 5, true)).toBe(0);
    expect(sumMinuteVolume(sparseTail, 3600, 60, true)).toBe(4600);
    expect(sumMinuteVolume(sparseTail.slice(1), 3600, 60, true)).toBeNull();
    expect(
      sumMinuteVolume(
        sparseTail.filter((c) => c.timestamp !== 600),
        3600,
        60,
        true,
      ),
    ).toBeNull();
    expect(sumMinuteVolume([], 3600, 5, true)).toBeNull();
    expect(
      sumMinuteVolume([{ timestamp: 0, volumeUsd: 1 }], 7200, 60, true),
    ).toBe(0);
    expect(
      sumMinuteVolume([{ timestamp: 3600, volumeUsd: 1 }], 3600, 5, true),
    ).toBeNull();
    expect(
      sumMinuteVolume(
        [...sparseTail, { timestamp: 600, volumeUsd: 99 }],
        3600,
        5,
        true,
      ),
    ).toBeNull();
  });
  it("суммирует независимые интервалы", () => {
    expect(sumMinuteVolume(candles, 3600, 5)).toBe(500);
    expect(sumMinuteVolume(candles, 3600, 60)).toBe(6000);
    expect(
      sumMinuteVolume(
        [...candles, { timestamp: 3600, volumeUsd: 999 }],
        3600,
        5,
      ),
    ).toBe(500);
  });
  it("не считает пропуск нулём и не удваивает дубли", () => {
    expect(sumMinuteVolume(candles.slice(0, 59), 3600, 5)).toBeNull();
    expect(sumMinuteVolume([...candles, candles[59]], 3600, 5)).toBe(500);
    expect(
      sumMinuteVolume([...candles, { timestamp: 3540, volumeUsd: 1 }], 3600, 5),
    ).toBeNull();
  });
  it("проверяет единицы и фильтр total TVL отдельно от active", () => {
    const input = {
      feeFraction: 0.01,
      volumeUsd: 200000,
      totalTvlUsd: 100000,
      denominator: "total" as const,
    };
    expect(estimatePoolYield(input).percent).toBe(2);
    expect(estimatePoolYield({ ...input, totalTvlUsd: 49999 }).eligible).toBe(
      false,
    );
    expect(
      estimatePoolYield({
        ...input,
        denominator: "active",
        activeTvlUsd: 10000,
      }),
    ).toMatchObject({ eligible: true, percent: 20, denominator: "active" });
    expect(
      estimatePoolYield({ ...input, feeFraction: null }).percent,
    ).toBeNull();
    expect(estimatePoolYield({ ...input, totalTvlUsd: 0 }).percent).toBeNull();
    expect(() => estimatePoolYield({ ...input, feeFraction: 2 })).toThrow();
    expect(() =>
      sumMinuteVolume([{ timestamp: 3540, volumeUsd: -1 }], 3600, 5),
    ).toThrow();
  });
});
