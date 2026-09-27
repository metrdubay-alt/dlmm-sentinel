import { describe, expect, it } from "vitest";
import {
  assessStrategy,
  classifyStrategy,
} from "../../shared/analysis/strategy";

const slow = {
  ageDays: 6,
  volume5mUsd: 50000,
  previousHourVolumeUsd: 600000,
  marketCapUsd: 1000001,
  holderCount: 2001,
  top10Pct: 14,
  bundlersPct: 9,
  phishingPct: 9,
  totalFeesSolEquivalent: 150,
  bundlerProfitTop10: [],
  bundlerRankingComplete: true,
};
describe("согласованные правила стратегии", () => {
  it("учитывает только нереализованный ROI при положительном остатке", () => {
    const r = assessStrategy({
      ...slow,
      bundlerProfitTop10: [
        { address: "sold", remainingTokens: 0, unrealizedRoiPct: 5000 },
        { address: "open", remainingTokens: 5, unrealizedRoiPct: 1000.01 },
        { address: "unknown", remainingTokens: null, unrealizedRoiPct: 5000 },
      ],
    });
    expect(r.highProfitWallets).toEqual(["open"]);
    expect(r.roiPenaltyPoints).toBe(2);
    expect(r.roiCoverageComplete).toBe(false);
  });
  it("закрытая позиция не требует ROI и не штрафуется", () => {
    const r = assessStrategy({
      ...slow,
      bundlerProfitTop10: [
        { address: "sold", remainingTokens: 0, unrealizedRoiPct: null },
      ],
    });
    expect(r.roiPenaltyPoints).toBe(0);
    expect(r.roiCoverageComplete).toBe(true);
  });
  it("общий и реализованный PnL не заменяют неизвестный ROI остатка", () => {
    const rows = [
      { address: "x", remainingTokens: 10, realizedRoiPct: 9000, roiPct: 8000 },
    ];
    const r = assessStrategy({ ...slow, bundlerProfitTop10: rows });
    expect(r.roiPenaltyPoints).toBe(0);
    expect(r.roiCoverageComplete).toBe(false);
  });
  it("не штрафует дважды один EVM-адрес в разном регистре", () => {
    expect(() =>
      assessStrategy({
        bundlerProfitTop10: [
          {
            address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
            remainingTokens: 1,
            unrealizedRoiPct: 2000,
          },
          {
            address: "0xABCDEFabcdefabcdefabcdefabcdefabcdefabcd",
            remainingTokens: 1,
            unrealizedRoiPct: 2000,
          },
        ],
      }),
    ).toThrow();
  });
  it("ровно 15% Top10 не вызывает предупреждение", () => {
    expect(assessStrategy({ ...slow, top10Pct: 15 }).warnings).not.toContain(
      "TOP10_REDUCTION",
    );
  });
  it("классифицирует возраст и капитализацию", () => {
    expect(classifyStrategy({ ageDays: 5 }).mode).toBe("runner");
    expect(classifyStrategy(slow).mode).toBe("slowcook");
    expect(classifyStrategy({ ...slow, volume5mUsd: 150000 }).reason).toBe(
      "mature",
    );
    expect(classifyStrategy({ ...slow, previousHourVolumeUsd: 0 }).mode).toBe(
      "slowcook",
    );
    expect(classifyStrategy({ ageDays: 6 }).mode).toBe("unknown");
  });
  it("вето строго на согласованных границах", () => {
    expect(assessStrategy({ ...slow, top10Pct: 22 }).vetoes).toContain(
      "TOP10_22",
    );
    expect(assessStrategy({ ...slow, top10Pct: 21.99 }).vetoes).toEqual([]);
    expect(
      assessStrategy({ ...slow, bundlersPct: 25, phishingPct: 25 }).vetoes,
    ).toEqual([]);
    expect(
      assessStrategy({ ...slow, bundlersPct: 25.01, phishingPct: 25 }).redFlags,
    ).toContain("COMBINED_50");
  });
  it("не заменяет отсутствующие данные нулями", () => {
    expect(assessStrategy({}).status).toBe("incomplete");
    expect(assessStrategy({ ...slow, phishingPct: null }).status).toBe(
      "incomplete",
    );
    expect(assessStrategy({ top10Pct: 23 }).status).toBe("veto");
  });
  it("проверяет строгий минимум holders, cap и включённые fees/volume", () => {
    expect(assessStrategy(slow).status).toBe("pass");
    expect(assessStrategy({ ...slow, holderCount: 1799 }).status).toBe("fail");
    expect(assessStrategy({ ...slow, marketCapUsd: 1000000 }).status).toBe(
      "fail",
    );
    expect(
      assessStrategy({ ...slow, totalFeesSolEquivalent: 149.99 }).status,
    ).toBe("fail");
  });
  it("Runner требует роста holders при cap 300k–1m", () => {
    const runner = {
      ...slow,
      ageDays: 1,
      volume5mUsd: 100000,
      marketCapUsd: 300000,
      holderCount: 1001,
      holderGrowth: 1,
    };
    expect(assessStrategy(runner).status).toBe("pass");
    expect(assessStrategy({ ...runner, holderCount: 999 }).status).toBe("fail");
    expect(assessStrategy({ ...runner, holderGrowth: 0 }).status).toBe("fail");
    expect(assessStrategy({ ...runner, holderGrowth: null }).status).toBe(
      "incomplete",
    );
  });
  it("считает штраф отдельно за каждый ROI >1000%", () => {
    const report = assessStrategy({
      ...slow,
      bundlerProfitTop10: [
        { address: "a", remainingTokens: 1, unrealizedRoiPct: 1000 },
        { address: "b", remainingTokens: 1, unrealizedRoiPct: 1000.01 },
        { address: "c", remainingTokens: 1, unrealizedRoiPct: 5000 },
      ],
    });
    expect(report.roiPenaltyPoints).toBe(4);
    expect(report.roiCoverageComplete).toBe(true);
    expect(
      assessStrategy({ ...slow, bundlerRankingComplete: false }).status,
    ).toBe("incomplete");
    expect(
      assessStrategy({
        ...slow,
        bundlerProfitTop10: [
          { address: "x", remainingTokens: 1, unrealizedRoiPct: null },
        ],
      }).roiCoverageComplete,
    ).toBe(false);
  });
  it("отвергает недостоверные числа и повтор одного кошелька", () => {
    expect(() => assessStrategy({ top10Pct: 101 })).toThrow();
    expect(() => classifyStrategy({ ageDays: -1 })).toThrow();
    expect(() => assessStrategy({ volume5mUsd: NaN })).toThrow();
    expect(() =>
      assessStrategy({
        bundlerProfitTop10: [
          { address: "a", remainingTokens: 1, unrealizedRoiPct: 2000 },
          { address: "a", remainingTokens: 1, unrealizedRoiPct: 2000 },
        ],
      }),
    ).toThrow();
  });
});
