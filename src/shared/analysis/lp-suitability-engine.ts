import type { Position, Report, Veto } from "../schemas/domain";
import { facts, fresh, type AnalysisContext } from "./context";
export function lpSuitabilityEngine(
  ctx: AnalysisContext,
  vetoes: Veto[],
  score: Report["score"],
  confidence: Report["confidence"],
  position?: Position,
): Report["suitability"] {
  const t = ctx.settings.thresholds,
    m = facts(ctx, "market"),
    h = facts(ctx, "holders"),
    s = facts(ctx, "social"),
    age = facts(ctx, "timing").ageHours;
  const softVetoes: string[] = [],
    warnings: string[] = [],
    reasons: string[] = [];
  const ratio = (a: number | undefined, b: number | undefined) =>
    a !== undefined && b !== undefined && b > 0 ? a / b : null;
  const exposureRatio = ratio(position?.amountUsd, m.liquidityUsd),
    insiderPressureRatio = ratio(
      h.riskyWalletSellableUsd,
      m.executableLiquidityUsd,
    ),
    volumeLiquidityRatio = ratio(m.volumeUsd, m.liquidityUsd);
  if (age === undefined || age < t.newTokenHours)
    softVetoes.push("Возраст токена менее 24 часов или не подтверждён.");
  if (m.poolAgeHours === undefined || m.poolAgeHours < t.newPoolHours)
    softVetoes.push("Недостаточная история пула.");
  if (h.insiderPct === undefined || !fresh(ctx, "holders"))
    softVetoes.push("Недостаточно свежих данных о холдерах.");
  if (
    (h.top1Pct ?? 0) >= t.top1MediumPct ||
    (h.top10Pct ?? 0) >= t.top10MediumPct
  )
    softVetoes.push("Повышенная концентрация держателей.");
  if (s.accountVerified !== true)
    softVetoes.push("Социальный аккаунт не проверен; покрытие ограничено.");
  if (s.kolCoordinated || s.unverifiedWarning)
    softVetoes.push(
      "Подозрительное продвижение или неподтверждённые предупреждения.",
    );
  if ((m.pumpPct ?? 0) >= t.parabolicPct)
    softVetoes.push(
      ctx.settings.demoMode
        ? "Краткосрочный параболический рост."
        : "Рост цены за 24 часа выше заданного порога.",
    );
  if ((volumeLiquidityRatio ?? 0) > t.highVolumeLiquidityRatio)
    softVetoes.push("Аномальный оборот относительно ликвидности.");
  if (confidence.total < t.confidenceMinimum)
    softVetoes.push("Confidence ниже минимального порога.");
  let verdict: Report["suitability"]["verdict"] = "SAFE_ENOUGH_FOR_REVIEW";
  if (vetoes.some((v) => v.triggered && v.severity === "CRITICAL")) {
    verdict = position?.recorded ? "EXIT_OR_MANUAL_REVIEW" : "DO_NOT_ENTER";
    reasons.push("Критический veto имеет приоритет над любым score.");
  } else if (
    !fresh(ctx, "chain") ||
    !fresh(ctx, "market") ||
    m.liquidityUsd === undefined ||
    confidence.total < t.confidenceCritical
  ) {
    verdict = "MANUAL_REVIEW";
    reasons.push("Недостаточно свежих основных данных для решения.");
  } else if (m.liquidityUsd <= 0 || score.total >= t.riskBlock) {
    verdict = "DO_NOT_ENTER";
    reasons.push("Риск превышает порог входа или ликвидность отсутствует.");
  } else if (score.total >= t.riskElevated) {
    verdict = "MICRO_SIZE_ONLY";
    reasons.push("Высокий обнаруженный риск.");
    if (
      (m.volatilityPct ?? 0) >= t.highVolatilityPct ||
      (insiderPressureRatio ?? 0) >= 1 ||
      (age ?? 0) < t.veryNewHours
    )
      verdict = "DO_NOT_ENTER";
  } else if (softVetoes.length > 0 || score.total >= t.riskModerate) {
    verdict = "MICRO_SIZE_ONLY";
    reasons.push("Есть ограничения размера позиции.");
  }
  if (exposureRatio !== null && exposureRatio > t.maxPositionLiquidityRatio) {
    warnings.push("Позиция превышает заданную долю ликвидности пула.");
    if (verdict === "SAFE_ENOUGH_FOR_REVIEW") verdict = "MICRO_SIZE_ONLY";
    else if (verdict === "MICRO_SIZE_ONLY") verdict = "DO_NOT_ENTER";
  }
  let rangeRisk: Report["suitability"]["rangeRisk"] = "UNKNOWN";
  if (position) {
    const outside =
      position.currentPrice <= position.lowerPrice ||
      position.currentPrice >= position.upperPrice;
    const distance =
      (Math.min(
        position.currentPrice - position.lowerPrice,
        position.upperPrice - position.currentPrice,
      ) /
        position.currentPrice) *
      100;
    if (outside) {
      rangeRisk = "EXTREME";
      warnings.push("Текущая цена вне активного диапазона.");
      if (verdict === "SAFE_ENOUGH_FOR_REVIEW" || verdict === "MICRO_SIZE_ONLY")
        verdict = "MANUAL_REVIEW";
    } else if (m.priceHistorySufficient && m.volatilityPct !== undefined) {
      const stress =
        (m.volatilityPct * Math.sqrt(position.horizonHours)) /
        Math.max(distance, 0.0001);
      rangeRisk =
        stress >= 3
          ? "EXTREME"
          : stress >= 1
            ? "HIGH"
            : stress >= 0.5
              ? "MEDIUM"
              : "LOW";
      warnings.push(
        "Риск выхода из диапазона — эвристика σ√t; это не вероятность и не модель доходности.",
      );
      if (
        score.total >= t.riskElevated &&
        (rangeRisk === "HIGH" || rangeRisk === "EXTREME") &&
        verdict === "MICRO_SIZE_ONLY"
      )
        verdict = "DO_NOT_ENTER";
    }
    if (
      ((position.currentPrice - position.lowerPrice) / position.currentPrice) *
        100 <=
        t.boundaryDistancePct &&
      score.total >= t.riskModerate
    )
      warnings.push(
        "Высокий риск неблагоприятной конвертации у нижней границы DLMM.",
      );
  }
  if (!reasons.length)
    reasons.push("Критические риски не обнаружены по доступным данным.");
  return {
    verdict,
    reasons,
    softVetoes,
    exposureRatio,
    insiderPressureRatio,
    volumeLiquidityRatio,
    rangeRisk,
    warnings,
  };
}
