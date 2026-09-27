import { z } from "zod";
import { metricPolicy, holderThresholds } from "./metric-policy";

const nonnegative = z.number().finite().nonnegative().nullish();
const percentage = z.number().finite().min(0).max(100).nullish();
const classificationSchema = z.object({
  ageDays: nonnegative,
  marketCapUsd: nonnegative,
  marketCapRange: z
    .object({
      lower: z.number().nonnegative(),
      upper: z.number().nonnegative(),
    })
    .refine((v) => v.upper >= v.lower)
    .nullish(),
  volume5mUsd: nonnegative,
  // This hour ends BEFORE the current five-minute window starts.
  previousHourVolumeUsd: nonnegative,
});
export type StrategyMode = "runner" | "slowcook" | "unknown";
export function classifyStrategy(input: z.input<typeof classificationSchema>): {
  mode: StrategyMode;
  reason: "young" | "low-cap" | "mature" | "missing-history";
} {
  const x = classificationSchema.parse(input);
  const lo = x.marketCapUsd ?? x.marketCapRange?.lower,
    hi = x.marketCapUsd ?? x.marketCapRange?.upper;
  if (x.ageDays != null && x.ageDays <= 5)
    return { mode: "runner", reason: "young" };
  if (hi != null && hi <= 1000000) return { mode: "runner", reason: "low-cap" };
  if (x.ageDays != null && x.ageDays > 5 && lo != null && lo > 1000000)
    return { mode: "slowcook", reason: "mature" };
  return { mode: "unknown", reason: "missing-history" };
}

const assessmentSchema = classificationSchema
  .extend({
    marketCapUsd: nonnegative,
    holderCount: z.number().int().nonnegative().nullish(),
    watchers: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .nullish(),
    holderGrowth: z.number().finite().nullish(),
    top10Pct: percentage,
    bundlersPct: percentage,
    phishingPct: percentage,
    totalFeesSolEquivalent: nonnegative,
    bundlerProfitTop10: z
      .array(
        z.object({
          address: z.string().min(1),
          remainingTokens: nonnegative,
          unrealizedRoiPct: z.number().finite().nullish(),
        }),
      )
      .max(10)
      .optional(),
    // True only for a complete top-ten ranking, or all wallets when fewer exist.
    bundlerRankingComplete: z.boolean().optional(),
  })
  .superRefine((x, ctx) => {
    const rows = x.bundlerProfitTop10 ?? [];
    const identity = (address: string) =>
      /^0x[0-9a-fA-F]{40}$/.test(address) ? address.toLowerCase() : address;
    if (new Set(rows.map((r) => identity(r.address))).size !== rows.length)
      ctx.addIssue({
        code: "custom",
        path: ["bundlerProfitTop10"],
        message: "Повтор кошелька в рейтинге",
      });
  });
export type StrategyInput = z.input<typeof assessmentSchema>;
export type StrategyCheck = { id: string; passed: boolean | null };

/** Consumes fresh, identity-checked, unit-verified provider data only.
 * Unknown, stale or semantically incompatible measurements must arrive as null.
 * This policy result is independent of the legacy risk score and pool yield.
 */
export function assessStrategy(input: StrategyInput) {
  const x = assessmentSchema.parse(input);
  const classification = classifyStrategy(x);
  const vetoes: string[] = [];
  const warnings: string[] = [];
  const redFlags: string[] = [];
  const context = { ...x, mode: classification.mode };
  const missing: string[] = [];
  const checks: StrategyCheck[] = [];
  const check = (id: string, passed: boolean | null) => {
    checks.push({ id, passed });
    if (passed === null) missing.push(id);
  };
  if (x.top10Pct == null) missing.push("top10Pct");
  else if (x.top10Pct >= 22) vetoes.push("TOP10_22");
  else if (x.top10Pct > 15) warnings.push("TOP10_REDUCTION");
  for (const key of ["bundlersPct", "phishingPct"] as const) {
    if (x[key] == null) missing.push(key);
    else if (x[key] > 20) warnings.push(`${key}_OVER_20`);
  }
  if (
    x.bundlersPct != null &&
    x.phishingPct != null &&
    x.bundlersPct + x.phishingPct > 50
  )
    redFlags.push("COMBINED_50");

  if (x.top10Pct != null && x.top10Pct >= 22) redFlags.push("TOP10_22");
  if (x.watchers != null && x.watchers < 100) redFlags.push("WATCHERS_RED");
  if (classification.mode === "unknown") missing.push("classification");
  else {
    const vol = metricPolicy("volume5mUsd", x.volume5mUsd, context);
    check("volume5m", x.volume5mUsd == null ? null : vol.kind !== "bad");
    if (vol.redFlag) redFlags.push("VOLUME_RED");
    if (classification.mode === "slowcook") {
      const fees = metricPolicy(
        "totalFeesSolEquivalent",
        x.totalFeesSolEquivalent,
        context,
      );
      check(
        "totalFees",
        x.totalFeesSolEquivalent == null ? null : fees.kind !== "bad",
      );
      if (fees.redFlag) redFlags.push("FEES_RED");
    }
  }
  const holders = holderThresholds(context);
  if (!holders) {
    missing.push("holderThreshold");
  } else {
    const h = metricPolicy("holderCount", x.holderCount, context);
    check("holders", x.holderCount == null ? null : !h.redFlag);
    if (h.redFlag) redFlags.push("HOLDERS_RED");
    if (classification.mode === "runner" && holders.red === 1000) {
      check("holderGrowth", x.holderGrowth == null ? null : x.holderGrowth > 0);
      if (x.holderGrowth != null && x.holderGrowth <= 0)
        redFlags.push("HOLDER_GROWTH_RED");
    }
  }
  const ranking = x.bundlerProfitTop10;
  const roiCoverageComplete =
    x.bundlerRankingComplete === true &&
    ranking !== undefined &&
    ranking.every(
      (r) =>
        r.remainingTokens === 0 ||
        (r.remainingTokens != null &&
          r.remainingTokens > 0 &&
          r.unrealizedRoiPct != null),
    );
  if (!roiCoverageComplete) missing.push("bundlerProfitTop10");
  const highProfitWallets = (ranking ?? [])
    .filter(
      (r) =>
        r.remainingTokens != null &&
        r.remainingTokens > 0 &&
        r.unrealizedRoiPct != null &&
        r.unrealizedRoiPct > 1000,
    )
    .map((r) => r.address);
  if (highProfitWallets.length)
    redFlags.push("BUNDLER_UNREALIZED_ROI_OVER_1000");
  const status = vetoes.length
    ? "veto"
    : redFlags.length || checks.some((c) => c.passed === false)
      ? "fail"
      : missing.length
        ? "incomplete"
        : "pass";
  return {
    policyVersion: "strategy-3",
    redFlags,
    classification,
    vetoes,
    warnings,
    checks,
    missing,
    highProfitWallets,
    roiCoverageComplete,
    roiPenaltyPoints: highProfitWallets.length * 2,
    status,
  };
}
