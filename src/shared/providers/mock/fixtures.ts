import type { Facts, ProviderId, Scenario } from "../../schemas/domain";
export const demoMint = "So11111111111111111111111111111111111111112";
export const scenarioLabels: Record<Scenario, string> = {
  "new-token": "Новый токен • без критических сигналов",
  concentration: "Концентрация инсайдеров",
  "mint-authority": "Активная mint authority",
  drained: "Выведенная ликвидность",
  social: "Подозрительное продвижение",
  insufficient: "Недостаточно данных",
};
const base: Record<ProviderId, Facts> = {
  chain: {
    mintAuthority: "revoked",
    freezeAuthority: "revoked",
    tokenProgram: "SPL",
    extensions: [],
    metadataMutableUnverified: false,
    sellRestricted: false,
  },
  holders: {
    insiderPct: 3,
    insiderIdentified: true,
    insiderExemptVerified: false,
    top1Pct: 4,
    top10Pct: 22,
    bundledPct: 0,
    insiderSellUsd: 0,
    riskyWalletSellableUsd: 3000,
    priorRugsProven: false,
    devSellProven: false,
  },
  market: {
    liquidityUsd: 350000,
    previousLiquidityUsd: 360000,
    executableLiquidityUsd: 140000,
    drained: false,
    fdvUsd: 4200000,
    volumeUsd: 480000,
    liquidityControllerPct: 20,
    washEvidence: false,
    pumpPct: 8,
    volatilityPct: 6,
    repeatedLargeSells: false,
    poolAgeHours: 10,
    priceHistorySufficient: true,
  },
  scanner: { rugged: false, honeypot: false, scannerMintActive: false },
  social: {
    securityWarningCredible: false,
    unverifiedWarning: false,
    kolCoordinated: false,
    botLikeEvidence: false,
    followerSpike: false,
    accountVerified: true,
  },
  url: { officialMaliciousLink: false, officialChannelConfirmed: true },
  legitimacy: {
    claimsDisproven: false,
    productMismatch: false,
    aggressivePromotionNoEvidence: false,
    contradictoryStatements: false,
    honestMeme: true,
  },
  timing: { ageHours: 12, nearEvent: false },
};
export function fixtureFacts(
  scenario: Scenario,
): Partial<Record<ProviderId, Facts>> {
  const data = structuredClone(base);
  if (scenario === "concentration")
    Object.assign(data.holders, {
      insiderPct: 32,
      top1Pct: 28,
      top10Pct: 72,
      bundledPct: 21,
    });
  if (scenario === "mint-authority") {
    data.chain.mintAuthority = "active-unverified";
    data.scanner.scannerMintActive = true;
  }
  if (scenario === "drained") {
    Object.assign(data.market, {
      liquidityUsd: 600,
      executableLiquidityUsd: 200,
      drained: true,
    });
    data.scanner.rugged = true;
  }
  if (scenario === "social")
    Object.assign(data.social, {
      kolCoordinated: true,
      botLikeEvidence: true,
      unverifiedWarning: true,
      followerSpike: true,
      accountVerified: false,
    });
  if (scenario === "insufficient") return {};
  return data;
}
