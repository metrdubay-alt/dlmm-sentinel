import { z } from "zod";
import { prospectsRevisionSchema } from "../analysis/prospects";
import bs58 from "bs58";
import { liveDetailsSchema } from "./live";
import {
  defaultThresholds,
  defaultWeights,
  thresholdsSchema,
  weightsSchema,
  categoryKeys,
} from "../config/risk-thresholds";
export const mintSchema = z
  .string()
  .trim()
  .max(44)
  .superRefine((value, ctx) => {
    let valid = false;
    try {
      valid = bs58.decode(value).length === 32;
    } catch {
      /* Invalid base58 is rejected. */
    }
    if (!valid)
      ctx.addIssue({
        code: "custom",
        message:
          value.length < 32
            ? "Для точного анализа вставьте Solana mint address. Тикер не является достаточным идентификатором токена."
            : "Некорректный Solana mint address: требуется 32-байтовый адрес Base58.",
      });
  });
export const providerIds = [
  "chain",
  "holders",
  "market",
  "scanner",
  "social",
  "url",
  "legitimacy",
  "timing",
] as const;
export const providerIdSchema = z.enum(providerIds);
export type ProviderId = z.infer<typeof providerIdSchema>;
const pct = z.number().finite().min(0).max(100);
const num = z.number().finite().nonnegative();
const authority = z.enum([
  "revoked",
  "active-unverified",
  "active-verified",
  "unknown",
]);
export const factsSchema = z
  .object({
    mintAuthority: authority.optional(),
    freezeAuthority: authority.optional(),
    tokenProgram: z.enum(["SPL", "Token-2022"]).optional(),
    extensions: z
      .array(
        z.object({
          name: z.string(),
          dangerous: z.boolean(),
          explained: z.boolean(),
          explanation: z.string(),
        }),
      )
      .optional(),
    metadataMutableUnverified: z.boolean().optional(),
    sellRestricted: z.boolean().optional(),
    insiderPct: pct.optional(),
    insiderIdentified: z.boolean().optional(),
    insiderExemptVerified: z.boolean().optional(),
    top1Pct: pct.optional(),
    top10Pct: pct.optional(),
    bundledPct: pct.optional(),
    insiderSellUsd: num.optional(),
    riskyWalletSellableUsd: num.optional(),
    priorRugsProven: z.boolean().optional(),
    devSellProven: z.boolean().optional(),
    liquidityUsd: num.optional(),
    previousLiquidityUsd: num.optional(),
    executableLiquidityUsd: num.optional(),
    drained: z.boolean().optional(),
    fdvUsd: num.optional(),
    volumeUsd: num.optional(),
    liquidityControllerPct: pct.optional(),
    washEvidence: z.boolean().optional(),
    pumpPct: z.number().finite().optional(),
    volatilityPct: num.optional(),
    repeatedLargeSells: z.boolean().optional(),
    poolAgeHours: num.optional(),
    priceHistorySufficient: z.boolean().optional(),
    rugged: z.boolean().optional(),
    honeypot: z.boolean().optional(),
    scannerMintActive: z.boolean().optional(),
    securityWarningCredible: z.boolean().optional(),
    unverifiedWarning: z.boolean().optional(),
    kolCoordinated: z.boolean().optional(),
    botLikeEvidence: z.boolean().optional(),
    followerSpike: z.boolean().optional(),
    accountVerified: z.boolean().optional(),
    officialMaliciousLink: z.boolean().optional(),
    officialChannelConfirmed: z.boolean().optional(),
    maliciousUrl: z.string().optional(),
    claimsDisproven: z.boolean().optional(),
    productMismatch: z.boolean().optional(),
    aggressivePromotionNoEvidence: z.boolean().optional(),
    contradictoryStatements: z.boolean().optional(),
    honestMeme: z.boolean().optional(),
    ageHours: num.optional(),
    nearEvent: z.boolean().optional(),
    eventDescription: z.string().optional(),
  })
  .strict();
export type Facts = z.infer<typeof factsSchema>;
export const snapshotSchema = z.object({
  providerId: z.enum([...providerIds, "meteora", "gmgn", "bubblemaps"]),
  displayName: z.string(),
  status: z.enum(["success", "partial", "unavailable", "error"]),
  data: factsSchema.optional(),
  fetchedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  sourceUrls: z.array(z.string().url()),
  rawResponse: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
  sourceType: z.enum(["mock", "live", "cached"]),
  details: liveDetailsSchema.optional(),
  evidenceId: z.string(),
  confidence: pct,
  stale: z.boolean(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const scenarioSchema = z.enum([
  "new-token",
  "concentration",
  "mint-authority",
  "drained",
  "social",
  "insufficient",
]);
export type Scenario = z.infer<typeof scenarioSchema>;
export const positionSchema = z
  .object({
    pair: z.string().trim().min(1).max(80),
    pool: z.string().max(100),
    currentPrice: num.positive(),
    lowerPrice: num.positive(),
    upperPrice: num.positive(),
    amountUsd: num.positive(),
    horizonHours: num.positive().max(8760),
    maxLossPct: pct.positive(),
    estimatedFeeApr: num.optional(),
    recorded: z.boolean(),
  })
  .strict()
  .refine(
    (p) => p.lowerPrice < p.upperPrice,
    "Нижняя граница должна быть меньше верхней.",
  );
export type Position = z.infer<typeof positionSchema>;
export const settingsSchema = z
  .object({
    demoMode: z.boolean(),
    liveMeteora: z.boolean().default(true),
    liveGmgn: z.boolean().default(true),
    liveBubblemaps: z.boolean().default(true),
    providers: z
      .object({
        chain: z.boolean(),
        holders: z.boolean(),
        market: z.boolean(),
        scanner: z.boolean(),
        social: z.boolean(),
        url: z.boolean(),
        legitimacy: z.boolean(),
        timing: z.boolean(),
      })
      .strict(),
    thresholds: thresholdsSchema,
    weights: weightsSchema,
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  demoMode: true,
  liveMeteora: true,
  liveGmgn: true,
  liveBubblemaps: true,
  providers: {
    chain: true,
    holders: true,
    market: true,
    scanner: true,
    social: true,
    url: true,
    legitimacy: true,
    timing: true,
  },
  thresholds: defaultThresholds,
  weights: defaultWeights,
};
export const scanRequestSchema = z
  .object({
    mint: mintSchema,
    scenario: scenarioSchema,
    mode: z.enum(["quick", "deep"]),
    dataMode: z.enum(["mock", "live"]).optional(),
    position: positionSchema.optional(),
  })
  .strict();
export type ScanRequest = z.infer<typeof scanRequestSchema>;
export const verdictSchema = z.enum([
  "SAFE_ENOUGH_FOR_REVIEW",
  "MICRO_SIZE_ONLY",
  "MANUAL_REVIEW",
  "DO_NOT_ENTER",
  "EXIT_OR_MANUAL_REVIEW",
]);
export const verdictLabels = {
  SAFE_ENOUGH_FOR_REVIEW: "МОЖНО РАССМАТРИВАТЬ",
  MICRO_SIZE_ONLY: "ТОЛЬКО МИКРОРАЗМЕР",
  MANUAL_REVIEW: "НУЖНА РУЧНАЯ ПРОВЕРКА",
  DO_NOT_ENTER: "НЕ ВХОДИТЬ",
  EXIT_OR_MANUAL_REVIEW: "ВЫЙТИ ИЛИ ПРОВЕСТИ РУЧНУЮ ПРОВЕРКУ",
};
export const vetoSchema = z.object({
  id: z.string(),
  titleRussian: z.string(),
  titleEnglish: z.string(),
  severity: z.enum(["CRITICAL", "HIGH"]),
  triggered: z.boolean(),
  reason: z.string(),
  evidenceIds: z.array(z.string()),
  freshness: z.enum(["fresh", "stale", "missing"]),
  confidence: pct,
  overridePolicy: z.literal("REVIEW_ONLY"),
  recommendedAction: verdictSchema,
  firstSeenAt: z.string().datetime().nullable(),
  lastSeenAt: z.string().datetime().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  reviewedNote: z.string().nullable(),
  status: z.enum(["ACTIVE", "REVIEWED", "RESOLVED", "INSUFFICIENT_DATA"]),
});
export type Veto = z.infer<typeof vetoSchema>;
export const contributionSchema = z.object({
  ruleId: z.string(),
  category: z.enum(categoryKeys),
  points: num.max(100),
  rawPoints: num,
  categoryMaximum: num.max(100),
  explanation: z.string(),
  evidenceIds: z.array(z.string()),
  confidence: pct,
  provider: z.string(),
  timestamp: z.string().datetime(),
  sourceType: z.enum(["mock", "live", "cached"]),
  unknown: z.boolean(),
});
export type Contribution = z.infer<typeof contributionSchema>;
export const reportSchema = z.object({
  id: z.string(),
  mint: mintSchema,
  scenario: scenarioSchema,
  mode: z.enum(["quick", "deep"]),
  generatedAt: z.string().datetime(),
  appVersion: z.enum([
    "0.1.0",
    "0.2.0",
    "0.2.1",
    "0.2.2",
    "0.3.0",
    "0.3.1",
    "0.3.2",
    "0.3.3",
    "0.3.4",
    "0.3.5",
    "0.3.6",
  ]),
  prospects: z.array(prospectsRevisionSchema).max(100).optional(),
  scoringVersion: z.string(),
  sourceType: z.enum(["mock", "live"]),
  settings: settingsSchema,
  position: positionSchema.optional(),
  snapshots: z.array(snapshotSchema),
  vetoes: z.array(vetoSchema),
  score: z.object({
    total: num.max(100),
    band: z.string(),
    contributions: z.array(contributionSchema),
    categories: z.record(z.string(), num.max(100)),
    unknownCategories: z.array(z.string()),
  }),
  confidence: z.object({
    total: num.max(100),
    band: z.string(),
    components: z.array(
      z.object({
        id: z.string(),
        points: num,
        maximum: num,
        reason: z.string(),
      }),
    ),
    conflicts: z.array(z.string()),
  }),
  suitability: z.object({
    verdict: verdictSchema,
    reasons: z.array(z.string()),
    softVetoes: z.array(z.string()),
    exposureRatio: num.nullable(),
    insiderPressureRatio: num.nullable(),
    volumeLiquidityRatio: num.nullable(),
    rangeRisk: z.enum(["LOW", "MEDIUM", "HIGH", "EXTREME", "UNKNOWN"]),
    warnings: z.array(z.string()),
  }),
});
export type Report = z.infer<typeof reportSchema>;
export const reviewSchema = z
  .object({
    reportId: z.string().min(1),
    vetoId: z.string().min(1),
    note: z.string().trim().min(1, "Введите непустое примечание.").max(2000),
  })
  .strict();
