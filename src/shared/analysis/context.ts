import type { Facts, ProviderId, Settings, Snapshot } from "../schemas/domain";
export type AnalysisContext = {
  snapshots: Snapshot[];
  settings: Settings;
  now: string;
};
export function source(ctx: AnalysisContext, id: ProviderId) {
  return ctx.snapshots.find((s) => s.providerId === id);
}
export function facts(ctx: AnalysisContext, id: ProviderId): Facts {
  return source(ctx, id)?.data ?? {};
}
const required: Record<ProviderId, (keyof Facts)[]> = {
  chain: [
    "mintAuthority",
    "freezeAuthority",
    "tokenProgram",
    "extensions",
    "metadataMutableUnverified",
    "sellRestricted",
  ],
  holders: [
    "insiderPct",
    "insiderIdentified",
    "insiderExemptVerified",
    "top1Pct",
    "top10Pct",
    "bundledPct",
    "insiderSellUsd",
    "riskyWalletSellableUsd",
    "priorRugsProven",
    "devSellProven",
  ],
  market: [
    "liquidityUsd",
    "previousLiquidityUsd",
    "executableLiquidityUsd",
    "drained",
    "fdvUsd",
    "volumeUsd",
    "liquidityControllerPct",
    "washEvidence",
    "pumpPct",
    "volatilityPct",
    "repeatedLargeSells",
    "poolAgeHours",
    "priceHistorySufficient",
  ],
  scanner: ["rugged", "honeypot", "scannerMintActive"],
  social: [
    "securityWarningCredible",
    "unverifiedWarning",
    "kolCoordinated",
    "botLikeEvidence",
    "followerSpike",
    "accountVerified",
  ],
  url: ["officialMaliciousLink", "officialChannelConfirmed"],
  legitimacy: [
    "claimsDisproven",
    "productMismatch",
    "aggressivePromotionNoEvidence",
    "contradictoryStatements",
    "honestMeme",
  ],
  timing: ["ageHours", "nearEvent"],
};
export function complete(ctx: AnalysisContext, id: ProviderId) {
  const s = source(ctx, id);
  return Boolean(
    s?.data &&
    s.status === "success" &&
    required[id].every(
      (k) => s.data![k] !== undefined && s.data![k] !== "unknown",
    ),
  );
}
export function fresh(ctx: AnalysisContext, id: ProviderId) {
  const s = source(ctx, id);
  return Boolean(
    s &&
    (ctx.settings.demoMode
      ? complete(ctx, id)
      : (s.status === "success" || s.status === "partial") && !!s.data) &&
    !s.stale &&
    Date.parse(s.fetchedAt) <= Date.parse(ctx.now) &&
    Date.parse(s.expiresAt) > Date.parse(ctx.now),
  );
}
export function ids(ctx: AnalysisContext, providers: ProviderId[]) {
  return providers.flatMap((p) =>
    source(ctx, p)?.data ? [source(ctx, p)!.evidenceId] : [],
  );
}
