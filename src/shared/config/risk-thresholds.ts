import { z } from "zod";
export const categoryKeys = [
  "contract",
  "holders",
  "liquidity",
  "flow",
  "social",
  "legitimacy",
  "timing",
] as const;
export const categoryLabels = {
  contract: "Контракт",
  holders: "Холдеры и инсайдеры",
  liquidity: "Ликвидность",
  flow: "Цена и потоки",
  social: "Социальные сигналы",
  legitimacy: "Достоверность проекта",
  timing: "Возраст и события",
};
export const defaultThresholds = {
  newTokenHours: 24,
  veryNewHours: 6,
  youngTokenHours: 168,
  newPoolHours: 6,
  insiderCriticalPct: 25,
  insiderHighPct: 15,
  insiderMediumPct: 8,
  top1HighPct: 15,
  top1MediumPct: 8,
  top10HighPct: 60,
  top10MediumPct: 40,
  bundleHighPct: 20,
  bundleMediumPct: 10,
  insiderSellRatio: 0.05,
  materialLiquidityUsd: 10000,
  drainedFraction: 0.05,
  lowLiquidityFdvRatio: 0.01,
  maxPositionLiquidityRatio: 0.01,
  highVolumeLiquidityRatio: 10,
  controlledLiquidityPct: 70,
  parabolicPct: 80,
  highVolatilityPct: 20,
  boundaryDistancePct: 5,
  confidenceMinimum: 60,
  confidenceCritical: 40,
  riskBlock: 61,
  riskElevated: 41,
  riskModerate: 21,
  chainFreshMinutes: 5,
  marketFreshMinutes: 2,
  holdersFreshMinutes: 5,
  scannerFreshMinutes: 5,
  socialFreshMinutes: 15,
  urlFreshMinutes: 1440,
  legitimacyFreshMinutes: 1440,
  timingFreshMinutes: 5,
  unknownAuthorityPoints: 5,
  unknownCategoryFraction: 1,
  mintPoints: 22,
  freezePoints: 18,
  trapPoints: 18,
  metadataPoints: 5,
  insiderHighPoints: 16,
  insiderMediumPoints: 10,
  top1HighPoints: 12,
  top1MediumPoints: 6,
  top10HighPoints: 10,
  top10MediumPoints: 5,
  sellingPoints: 16,
  bundleHighPoints: 12,
  bundleMediumPoints: 4,
  controlledLiquidityPoints: 14,
  liquidityFdvPoints: 8,
  exposurePoints: 8,
  turnoverPoints: 6,
  washPoints: 8,
  pumpPoints: 6,
  volatilityPoints: 5,
  largeSellsPoints: 8,
  flowSellingPoints: 5,
  warningPoints: 8,
  kolPoints: 6,
  botPoints: 4,
  fakeClaimPoints: 8,
  followerPoints: 3,
  mismatchPoints: 6,
  promotionPoints: 4,
  contradictionPoints: 6,
  veryNewPoints: 7,
  newPoints: 4,
  youngPoints: 2,
  eventPoints: 4,
};
const numericShape = Object.fromEntries(
  Object.keys(defaultThresholds).map((key) => [
    key,
    z.number().finite().nonnegative().max(1000000),
  ]),
) as Record<keyof typeof defaultThresholds, z.ZodNumber>;
export const thresholdsSchema = z
  .object(numericShape)
  .strict()
  .superRefine((t, ctx) => {
    if (!(
      t.veryNewHours < t.newTokenHours &&
      t.newTokenHours < t.youngTokenHours &&
      t.insiderMediumPct < t.insiderHighPct &&
      t.insiderHighPct < t.insiderCriticalPct &&
      t.confidenceCritical < t.confidenceMinimum &&
      t.riskModerate < t.riskElevated &&
      t.riskElevated < t.riskBlock
    ))
      ctx.addIssue({
        code: "custom",
        message: "Пороги должны возрастать последовательно.",
      });
    if (
      t.unknownCategoryFraction > 1 ||
      t.drainedFraction > 1 ||
      t.maxPositionLiquidityRatio > 1 ||
      t.confidenceMinimum > 100 ||
      t.riskBlock > 100 ||
      t.insiderCriticalPct > 100
    )
      ctx.addIssue({
        code: "custom",
        message: "Доля должна быть 0–1, баллы и проценты — 0–100.",
      });
    for (const key of Object.keys(t) as (keyof typeof t)[])
      if (
        (key.includes("FreshMinutes") || key === "materialLiquidityUsd") &&
        t[key] <= 0
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Период свежести и значимая ликвидность должны быть положительными.",
        });
  });
export const weightsSchema = z
  .object({
    contract: z.number().min(0).max(100),
    holders: z.number().min(0).max(100),
    liquidity: z.number().min(0).max(100),
    flow: z.number().min(0).max(100),
    social: z.number().min(0).max(100),
    legitimacy: z.number().min(0).max(100),
    timing: z.number().min(0).max(100),
  })
  .strict()
  .refine(
    (v) =>
      Math.abs(Object.values(v).reduce((a, b) => a + b, 0) - 100) < 0.00001,
    "Сумма весов должна быть 100.",
  );
export const defaultWeights = {
  contract: 22,
  holders: 20,
  liquidity: 18,
  flow: 12,
  social: 12,
  legitimacy: 8,
  timing: 8,
};
export const SCORING_VERSION = "sentinel-rules-1.1.0";
