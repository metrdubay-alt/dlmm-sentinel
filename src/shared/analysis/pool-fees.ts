import type { MetricPolicy } from "./metric-policy";
import type { StrategyMode } from "./strategy";
import type { PoolRow } from "./pool-snapshot";

export type FabriqFeeEvidence = {
  address: string;
  fees5mUsd: number;
};

const neutral = (hint: string): MetricPolicy => ({
  kind: "neutral",
  strength: 0,
  redFlag: false,
  hint,
  quality: null,
});

export function poolFeeTone(
  value: number | null | undefined,
  mode: StrategyMode,
): MetricPolicy {
  if (value == null || !Number.isFinite(value) || value < 0)
    return neutral("Комиссия Fabriq за 5 минут не подтверждена.");
  if (mode !== "runner")
    return neutral("Порог 5m Fees применяется только к профилю «Раннеры».");
  if (value < 150)
    return {
      kind: "bad",
      strength: 1,
      redFlag: true,
      hint: "Красный флаг: 5m Fees меньше $150.",
      quality: 0,
    };
  if (value < 300)
    return {
      kind: "bad",
      strength: (300 - value) / 150,
      redFlag: false,
      hint: "Красная зона: 5m Fees от $150 до $300.",
      quality: 0.25,
    };
  if (value <= 450)
    return neutral("Серая зона: 5m Fees от $300 до $450.");
  return {
    kind: "good",
    strength: Math.min(1, (value - 450) / 450),
    redFlag: false,
    hint: "Зелёная зона: 5m Fees больше $450.",
    quality: 1,
  };
}

export function applyFabriqFees(
  rows: PoolRow[],
  evidence: FabriqFeeEvidence[],
): PoolRow[] {
  const byAddress = new Map<string, number>();
  for (const item of evidence) {
    if (
      typeof item.address === "string" &&
      Number.isFinite(item.fees5mUsd) &&
      item.fees5mUsd >= 0
    )
      byAddress.set(item.address, item.fees5mUsd);
  }
  return rows.map((row) => {
    const fees5mUsd = byAddress.get(row.address);
    return {
      ...row,
      fabriqFees5mUsd: fees5mUsd ?? null,
      fabriqMatch: fees5mUsd == null ? "missing" : "matched",
    };
  });
}
