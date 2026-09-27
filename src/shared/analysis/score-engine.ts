import { categoryKeys } from "../config/risk-thresholds";
import type {
  Contribution,
  Position,
  ProviderId,
  Report,
} from "../schemas/domain";
import { complete, facts, ids, source, type AnalysisContext } from "./context";
export function scoreEngine(
  ctx: AnalysisContext,
  position?: Position,
): Report["score"] {
  const c = facts(ctx, "chain"),
    h = facts(ctx, "holders"),
    m = facts(ctx, "market"),
    r = facts(ctx, "scanner"),
    s = facts(ctx, "social"),
    u = facts(ctx, "url"),
    l = facts(ctx, "legitimacy"),
    a = facts(ctx, "timing"),
    t = ctx.settings.thresholds;
  const contributions: Contribution[] = [];
  const categories: Record<string, number> = Object.fromEntries(
    categoryKeys.map((k) => [k, 0]),
  );
  const unknownCategories: string[] = [];
  const add = (
    category: Contribution["category"],
    ruleId: string,
    points: number,
    explanation: string,
    providers: ProviderId[],
    unknown = false,
  ) => {
    const cap = ctx.settings.weights[category],
      applied = Math.min(points, Math.max(0, cap - categories[category]));
    categories[category] += applied;
    contributions.push({
      ruleId,
      category,
      points: applied,
      rawPoints: points,
      categoryMaximum: cap,
      explanation,
      evidenceIds: ids(ctx, providers),
      confidence: unknown
        ? 0
        : Math.min(...providers.map((p) => source(ctx, p)?.confidence ?? 0)),
      provider: providers.join(", "),
      timestamp: ctx.now,
      sourceType: ctx.settings.demoMode
        ? "mock"
        : providers.some((p) => source(ctx, p)?.sourceType === "cached")
          ? "cached"
          : "live",
      unknown,
    });
  };
  if (c.mintAuthority === "active-unverified")
    add(
      "contract",
      "A_MINT",
      t.mintPoints,
      "Активная непроверенная mint authority.",
      ["chain"],
    );
  if (c.freezeAuthority === "active-unverified")
    add(
      "contract",
      "A_FREEZE",
      t.freezePoints,
      "Активная непроверенная freeze authority.",
      ["chain"],
    );
  if (r.honeypot || c.sellRestricted)
    add("contract", "A_SELL", 22, "Подтверждённое ограничение продажи.", [
      "chain",
      "scanner",
    ]);
  if (c.extensions?.some((e) => e.dangerous && !e.explained))
    add(
      "contract",
      "A_EXTENSION",
      t.trapPoints,
      "Необъяснённое опасное расширение.",
      ["chain"],
    );
  if (c.metadataMutableUnverified)
    add(
      "contract",
      "A_METADATA",
      t.metadataPoints,
      "Метаданные изменяемы непроверенной authority.",
      ["chain"],
    );
  if (
    c.mintAuthority === undefined ||
    c.mintAuthority === "unknown" ||
    c.freezeAuthority === undefined ||
    c.freezeAuthority === "unknown"
  )
    add(
      "contract",
      "A_UNKNOWN_AUTHORITY",
      t.unknownAuthorityPoints,
      "Статус authority не проверен.",
      ["chain"],
      true,
    );
  const insider =
    h.insiderIdentified && h.insiderExemptVerified === false
      ? (h.insiderPct ?? 0)
      : 0;
  if (insider >= t.insiderCriticalPct)
    add(
      "holders",
      "B_INSIDER_CRITICAL",
      20,
      "Критическая подтверждённая концентрация инсайдеров.",
      ["holders"],
    );
  else if (insider >= t.insiderHighPct)
    add(
      "holders",
      "B_INSIDER_HIGH",
      t.insiderHighPoints,
      "Высокая доля установленной группы.",
      ["holders"],
    );
  else if (insider >= t.insiderMediumPct)
    add(
      "holders",
      "B_INSIDER_MEDIUM",
      t.insiderMediumPoints,
      "Повышенная доля установленной группы.",
      ["holders"],
    );
  if ((h.top1Pct ?? 0) >= t.top1MediumPct)
    add(
      "holders",
      "B_TOP1",
      (h.top1Pct ?? 0) >= t.top1HighPct ? t.top1HighPoints : t.top1MediumPoints,
      "Концентрация крупнейшего держателя после надёжных исключений.",
      ["holders"],
    );
  if ((h.top10Pct ?? 0) >= t.top10MediumPct)
    add(
      "holders",
      "B_TOP10",
      (h.top10Pct ?? 0) >= t.top10HighPct
        ? t.top10HighPoints
        : t.top10MediumPoints,
      "Концентрация десяти крупнейших держателей.",
      ["holders"],
    );
  if (h.insiderIdentified && (h.insiderSellUsd ?? 0) > 0)
    add(
      "holders",
      "B_SELL",
      t.sellingPoints,
      "Установлены чистые продажи инсайдеров.",
      ["holders"],
    );
  if ((h.bundledPct ?? 0) >= t.bundleMediumPct)
    add(
      "holders",
      "B_BUNDLE",
      (h.bundledPct ?? 0) >= t.bundleHighPct
        ? t.bundleHighPoints
        : t.bundleMediumPoints,
      "Вероятная концентрация ранних связанных покупок.",
      ["holders"],
    );
  if (
    r.rugged ||
    m.drained ||
    ((m.previousLiquidityUsd ?? 0) >= t.materialLiquidityUsd &&
      m.liquidityUsd !== undefined &&
      m.liquidityUsd <= m.previousLiquidityUsd! * t.drainedFraction)
  )
    add(
      "liquidity",
      "C_DRAINED",
      18,
      "Ликвидность выведена до критического уровня.",
      ["market", "scanner"],
    );
  if ((m.liquidityControllerPct ?? 0) >= t.controlledLiquidityPct)
    add(
      "liquidity",
      "C_CONTROL",
      t.controlledLiquidityPoints,
      "Большая часть ликвидности контролируется одной стороной.",
      ["market"],
    );
  if (
    (m.fdvUsd ?? 0) > 0 &&
    m.liquidityUsd !== undefined &&
    m.liquidityUsd / m.fdvUsd! < t.lowLiquidityFdvRatio
  )
    add(
      "liquidity",
      "C_FDV",
      t.liquidityFdvPoints,
      "Низкая ликвидность относительно FDV; FDV является оценкой.",
      ["market"],
    );
  if (
    position &&
    m.liquidityUsd !== undefined &&
    (m.liquidityUsd === 0 ||
      position.amountUsd / m.liquidityUsd > t.maxPositionLiquidityRatio)
  )
    add(
      "liquidity",
      "C_EXPOSURE",
      t.exposurePoints,
      "Размер позиции превышает допустимую долю ликвидности.",
      ["market"],
    );
  if (
    (m.liquidityUsd ?? 0) > 0 &&
    (m.volumeUsd ?? 0) / m.liquidityUsd! > t.highVolumeLiquidityRatio
  )
    add(
      "liquidity",
      "C_TURNOVER",
      t.turnoverPoints,
      "Высокий оборот относительно ликвидности.",
      ["market"],
    );
  if (m.washEvidence)
    add(
      "liquidity",
      "C_WASH",
      t.washPoints,
      "Обнаружены признаки искусственного объёма.",
      ["market"],
    );
  if ((m.pumpPct ?? 0) >= t.parabolicPct)
    add(
      "flow",
      "D_PUMP",
      t.pumpPoints,
      ctx.settings.demoMode
        ? "Вертикальный рост без проверенного катализатора."
        : "Рост цены за 24 часа выше заданного порога. Форма движения и катализатор не проверены.",
      ["market"],
    );
  if ((m.volatilityPct ?? 0) >= t.highVolatilityPct)
    add(
      "flow",
      "D_VOLATILITY",
      t.volatilityPoints,
      "Высокая краткосрочная волатильность.",
      ["market"],
    );
  if (m.repeatedLargeSells)
    add(
      "flow",
      "D_SELLS",
      t.largeSellsPoints,
      "Повторяющиеся крупные продажи.",
      ["market"],
    );
  if (
    (h.insiderSellUsd ?? 0) > 0 &&
    categories.holders < ctx.settings.weights.holders
  )
    add(
      "flow",
      "D_INSIDER_FLOW",
      t.flowSellingPoints,
      "Давление продаж; категория инсайдеров ещё не достигла максимума.",
      ["holders"],
    );
  if (u.officialMaliciousLink && u.officialChannelConfirmed)
    add(
      "social",
      "E_PHISHING",
      12,
      "Опасная ссылка подтверждённого официального канала.",
      ["url"],
    );
  if (s.securityWarningCredible)
    add(
      "social",
      "E_WARNING",
      t.warningPoints,
      "Подкреплённое доказательствами предупреждение.",
      ["social"],
    );
  if (s.kolCoordinated)
    add(
      "social",
      "E_KOL",
      t.kolPoints,
      "Признаки согласованного продвижения.",
      ["social"],
    );
  if (s.botLikeEvidence)
    add(
      "social",
      "E_BOTLIKE",
      t.botPoints,
      "Вероятно ботоподобная активность: повторяющееся вовлечение.",
      ["social"],
    );
  if (l.claimsDisproven)
    add(
      "social",
      "E_FAKE_CLAIM",
      t.fakeClaimPoints,
      "Подтверждённое ложное заявление.",
      ["legitimacy"],
    );
  if (s.followerSpike)
    add(
      "social",
      "E_FOLLOWERS",
      t.followerPoints,
      "Необъяснённый скачок подписчиков.",
      ["social"],
    );
  if (l.productMismatch)
    add(
      "legitimacy",
      "F_MISMATCH",
      t.mismatchPoints,
      "Заявленный продукт не соответствует доказательствам.",
      ["legitimacy"],
    );
  if (l.aggressivePromotionNoEvidence)
    add(
      "legitimacy",
      "F_PROMOTION",
      t.promotionPoints,
      "Агрессивная финансовая реклама без доказательств заявлений.",
      ["legitimacy"],
    );
  if (l.contradictoryStatements)
    add(
      "legitimacy",
      "F_CONTRADICTION",
      t.contradictionPoints,
      "Противоречащие друг другу официальные заявления.",
      ["legitimacy"],
    );
  if (a.ageHours !== undefined && a.ageHours < t.youngTokenHours)
    add(
      "timing",
      "G_AGE",
      a.ageHours < t.veryNewHours
        ? t.veryNewPoints
        : a.ageHours < t.newTokenHours
          ? t.newPoints
          : t.youngPoints,
      `Возраст токена: ${a.ageHours} ч. Новизна увеличивает риск, но не доказывает мошенничество.`,
      ["timing"],
    );
  if (a.nearEvent)
    add(
      "timing",
      "G_EVENT",
      t.eventPoints,
      "Ближайшее событие потенциально увеличивает продажи.",
      ["timing"],
    );
  const required: Record<Contribution["category"], boolean> = {
    contract:
      c.mintAuthority !== undefined &&
      c.mintAuthority !== "unknown" &&
      c.freezeAuthority !== undefined &&
      c.freezeAuthority !== "unknown" &&
      c.extensions !== undefined &&
      r.honeypot !== undefined,
    holders:
      h.top1Pct !== undefined &&
      h.top10Pct !== undefined &&
      h.insiderPct !== undefined,
    liquidity: m.liquidityUsd !== undefined,
    flow: m.priceHistorySufficient === true && m.volatilityPct !== undefined,
    social:
      s.accountVerified !== undefined && u.officialMaliciousLink !== undefined,
    legitimacy: l.claimsDisproven !== undefined,
    timing: a.ageHours !== undefined,
  };
  const mapping: Record<Contribution["category"], ProviderId[]> = {
    contract: ["chain", "scanner"],
    holders: ["holders"],
    liquidity: ["market", "scanner"],
    flow: ["market", "holders"],
    social: ["social", "url", "legitimacy"],
    legitimacy: ["legitimacy"],
    timing: ["timing"],
  };
  for (const cat of categoryKeys)
    if (!required[cat] || !mapping[cat].every((id) => complete(ctx, id))) {
      unknownCategories.push(cat);
      add(
        cat,
        `${cat.toUpperCase()}_UNKNOWN`,
        Math.max(
          0,
          ctx.settings.weights[cat] * t.unknownCategoryFraction -
            categories[cat],
        ),
        "Недостаточное покрытие: консервативная надбавка неопределённости, а не доказанное нарушение.",
        mapping[cat],
        true,
      );
    }
  const total =
    Math.round(Object.values(categories).reduce((a, b) => a + b, 0) * 100) /
    100;
  return {
    total,
    band:
      total <= 20
        ? "LOW_DETECTED_RISK"
        : total <= 40
          ? "MODERATE_RISK"
          : total <= 60
            ? "HIGH_RISK"
            : total <= 80
              ? "VERY_HIGH_RISK"
              : "EXTREME_RISK",
    contributions,
    categories,
    unknownCategories,
  };
}
