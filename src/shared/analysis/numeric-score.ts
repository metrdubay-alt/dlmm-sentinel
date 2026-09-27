import { metricPolicy } from "./metric-policy";
import { assessStrategy, type StrategyInput } from "./strategy";
export function numericScore(x: StrategyInput) {
  const assessment = assessStrategy(x);
  const mode = assessment.classification.mode;
  const count = x.watchers;
  const watchers =
    count == null
      ? { count: null, adjustment: null, status: "unknown" as const }
      : {
          count,
          adjustment:
            count < 100 ? -10 : count < 200 ? -5 : count > 400 ? 5 : 0,
          status:
            count < 100
              ? ("red" as const)
              : count < 200
                ? ("low" as const)
                : count > 400
                  ? ("high" as const)
                  : ("normal" as const),
        };
  if (count == null) {
    assessment.missing.push("watchers");
    if (assessment.status === "pass") assessment.status = "incomplete";
  } else if (count < 100) assessment.warnings.push("WATCHERS_RED");
  else if (count < 200) assessment.warnings.push("WATCHERS_LOW");
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const components: { label: string; max: number; points: number | null }[] =
    [];
  const add = (label: string, max: number, points: number | null) =>
    components.push({
      label,
      max,
      points: points === null ? null : Math.max(0, Math.min(max, points)),
    });
  const context = { ...x, mode };
  for (const [key, label, weight] of [
    ["volume5mUsd", "Объём за 5 минут", 30],
    ["top10Pct", "Top 10", 20],
    ["bundlersPct", "Бандлеры", 15],
    ["phishingPct", "Phishing", 15],
    ["holderCount", "Холдеры", 10],
  ] as const) {
    const q = metricPolicy(key, x[key], context).quality;
    add(label, weight, q == null ? null : q * weight);
  }
  if (mode === "runner") add("Рекомендация Runner", 10, 10);
  else if (mode === "slowcook") {
    add("Условия Slowcook", 5, 5);
    const q = metricPolicy(
      "totalFeesSolEquivalent",
      x.totalFeesSolEquivalent,
      context,
    ).quality;
    add("Total Fees слоукука", 5, q == null ? null : q * 5);
  } else add("Рекомендация стратегии", 10, null);
  const coveredWeight = components.reduce(
    (s, c) => s + (c.points === null ? 0 : c.max),
    0,
  );
  const earned = components.reduce((s, c) => s + (c.points ?? 0), 0);
  const penalty = assessment.roiPenaltyPoints;
  const lower = clamp(
    earned -
      (assessment.roiCoverageComplete ? penalty : 20) +
      (watchers.adjustment ?? -10),
  );
  const upper = clamp(
    earned + 100 - coveredWeight - penalty + (watchers.adjustment ?? 5),
  );
  return {
    model: "numeric-3",
    watchers,
    components,
    coveredWeight,
    earned,
    penalty,
    lower,
    upper,
    total:
      coveredWeight === 100 &&
      assessment.roiCoverageComplete &&
      assessment.missing.length === 0
        ? clamp(earned - penalty + (watchers.adjustment ?? 0))
        : null,
    assessment,
  };
}
