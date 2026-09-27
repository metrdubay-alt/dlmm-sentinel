import type { StrategyMode } from "./strategy";
export type MetricContext = {
  mode?: StrategyMode;
  marketCapUsd?: number | null;
  marketCapRange?: { lower: number; upper: number } | null;
};
export type MetricPolicy = {
  kind: "good" | "bad" | "neutral";
  strength: number;
  redFlag: boolean;
  hint: string;
  quality: number | null;
};
const neutral = (
  hint: string,
  quality: number | null = null,
): MetricPolicy => ({
  kind: "neutral",
  strength: 0,
  redFlag: false,
  hint,
  quality,
});
const tone = (
  delta: number,
  hint: string,
  quality: number,
  redFlag = false,
): MetricPolicy => ({
  kind: delta > 0 ? "good" : "bad",
  strength: Math.min(1, Math.max(0.04, Math.abs(delta))),
  redFlag,
  hint,
  quality: Math.max(0, Math.min(1, quality)),
});
export function holderThresholds(c: MetricContext) {
  const lo = c.marketCapUsd ?? c.marketCapRange?.lower,
    hi = c.marketCapUsd ?? c.marketCapRange?.upper;
  if (lo == null || hi == null) return null;
  return lo > 1000000
    ? { red: 1800, green: 3000 }
    : lo >= 300000 && hi <= 1000000
      ? { red: 1000, green: 1500 }
      : null;
}
function increasing(
  value: number,
  red: number,
  end: number,
  green: number,
  hint: string,
): MetricPolicy {
  if (value < red) return tone(-1, hint, 0, true);
  if (value < end)
    return tone(
      -(end - value) / (end - red),
      hint,
      (0.4 * (value - red)) / (end - red),
    );
  if (value <= green)
    return neutral(hint, 0.4 + (0.2 * (value - end)) / (green - end));
  return tone(
    (value - green) / green,
    hint,
    0.6 + (0.4 * (value - green)) / green,
  );
}
export function metricPolicy(
  key: string,
  value: number | null | undefined,
  c: MetricContext = {},
): MetricPolicy {
  if (value == null || !Number.isFinite(value) || value < 0)
    return neutral("Нет данных");
  switch (key) {
    case "top10Pct": {
      const hint = "Зелёный <10%; нейтрально 10–15%; красный >15%; вето ≥22%";
      return value < 10
        ? tone((10 - value) / 10, hint, 1)
        : value <= 15
          ? neutral(hint, 1 - (0.25 * (value - 10)) / 5)
          : tone(
              -(value - 15) / 30,
              hint,
              (0.75 * (22 - value)) / 7,
              value >= 22,
            );
    }
    case "bundlersPct":
    case "phishingPct": {
      const hint =
        "Зелёный <10%; нейтрально 10–15%; красный >15%; сумма бандлеров и phishing >50% — red flag";
      return value < 10
        ? tone((10 - value) / 10, hint, 1)
        : value <= 15
          ? neutral(hint, 1 - (value - 10) / 15)
          : tone(-(value - 15) / 35, hint, ((2 / 3) * (50 - value)) / 35);
    }
    case "combinedPct":
      return value > 50
        ? tone(
            -(value - 50) / 50,
            "Сумма бандлеров + phishing >50% — red flag",
            0,
            true,
          )
        : neutral("Сумма бандлеров + phishing: red flag строго выше 50%");
    case "watchers":
      return value < 200
        ? tone(
            -(200 - value) / 200,
            "Менее 100 — red flag; 100–199 — штраф; 200–400 нейтрально",
            value / 200,
            value < 100,
          )
        : value > 400
          ? tone(
              (value - 400) / 400,
              "Больше 400 наблюдателей — преимущество",
              1,
            )
          : neutral("Норма 200–400 наблюдателей", 1);
    case "volume1hUsd": {
      const result = metricPolicy("volume5mUsd", value / 12, c);
      return {
        ...result,
        hint:
          c.mode === "runner"
            ? "Runner за час: <600 000 — red flag; 600 000–960 000 красный; 960 000–1 200 000 нейтрально; >1 200 000 зелёный"
            : c.mode === "slowcook"
              ? "Slowcook за час: <300 000 — red flag; 300 000–480 000 красный; 480 000–600 000 нейтрально; >600 000 зелёный"
              : result.hint,
      };
    }
    case "volume5mUsd":
      return c.mode === "runner"
        ? increasing(
            value,
            50000,
            80000,
            100000,
            "Runner: <50 000 — red flag; 50 000–80 000 красный; 80 000–100 000 нейтрально; >100 000 зелёный",
          )
        : c.mode === "slowcook"
          ? increasing(
              value,
              25000,
              40000,
              50000,
              "Slowcook: <25 000 — red flag; 25 000–40 000 красный; 40 000–50 000 нейтрально; >50 000 зелёный",
            )
          : neutral("Объём: нужна рекомендация Runner/Slowcook");
    case "holderCount": {
      const h = holderThresholds(c);
      if (!h)
        return neutral("Порог холдеров задан для капитализации от $300 000");
      const hint = `Холдеры: <${h.red} — red flag; ${h.red}–${h.green} нейтрально; >${h.green} зелёный`;
      return value < h.red
        ? tone(-(h.red - value) / h.red, hint, 0, true)
        : value <= h.green
          ? neutral(hint, 0.5 + (0.2 * (value - h.red)) / (h.green - h.red))
          : tone(
              (value - h.green) / h.green,
              hint,
              0.7 + (0.3 * (value - h.green)) / h.green,
            );
    }
    case "totalFeesSolEquivalent":
      return c.mode === "slowcook"
        ? increasing(
            value,
            100,
            150,
            200,
            "Slowcook Total Fees: <100 SOL — red flag; 100–150 красный; 150–200 нейтрально; >200 зелёный",
          )
        : neutral(
            "Total Fees показан для всех токенов; пороги применяются только к Slowcook",
          );
    case "marketCapUsd":
      return c.mode === "slowcook"
        ? tone(
            (value - 1000000) / 1000000,
            "Капитализация >$1 млн — условие рекомендации Slowcook",
            1,
          )
        : neutral(
            "Капитализация используется для рекомендации стратегии и нормы холдеров",
          );
    default:
      return neutral("Для показателя не задан порог");
  }
}
