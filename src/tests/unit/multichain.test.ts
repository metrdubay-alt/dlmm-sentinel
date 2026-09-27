import { it, expect } from "vitest";
import { gmgnTargetSchema } from "../../shared/analysis/gmgn";
import { poolNetwork } from "../../shared/analysis/pool-snapshot";
import { parseGrokAnswer } from "../../shared/analysis/grok";
it("keeps EVM networks distinct and discovers an X profile only with sources", () => {
  for (const chain of ["eth", "base", "robinhood"] as const) {
    const target = gmgnTargetSchema.parse({
      chain,
      address: "0x7Fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
    });
    expect(poolNetwork(target)).toBe(chain);
    const c = {
      target,
      handle: null,
      requestId: "new",
      startedAt: "2026-09-27T00:00:00Z",
    };
    const answer = {
      requestId: "new",
      chain,
      mint: target.address,
      profile: null,
      description: "Test",
      score: null,
      scoreReason: "Missing",
      narrative: "unknown",
      redFlags: [],
      greenFlags: [],
      accounts: [],
      sources: [],
      unknowns: [],
      discoveredProfile: { handle: "aave", sources: ["https://aave.com/"] },
      tokenSymbol: "AAVE",
    };
    expect(
      parseGrokAnswer(JSON.stringify(answer), c).discoveredProfile?.handle,
    ).toBe("aave");
    expect(() =>
      parseGrokAnswer(
        JSON.stringify({
          ...answer,
          discoveredProfile: { handle: "aave", sources: [] },
        }),
        c,
      ),
    ).toThrow();
  }
});

import { parseGmgnCard } from "../../shared/analysis/gmgn";
import { convertFees } from "../../shared/analysis/fee-rates";
it("reads Base ETH fees with correct units and rejects another chain explorer", () => {
  const address = "0x0cbf291ba052174879d90bf781df1a5f2bc5bb07",
    at = "2026-09-27T00:00:00Z";
  const raw = {
    url: `https://gmgn.ai/base/token/${address}`,
    tokenLinks: [`https://basescan.org/token/${address}#code`],
    poolLinks: [],
    info: { "Total Fees": "6" },
    risk: {},
    pool: {},
    tooltips: [],
    volumeText: "",
    volumePeriod: "5m",
    feeIcon: "IconBaseeth10016pxS",
    holdersState: "unavailable",
    holders: [],
  };
  const target = { chain: "base" as const, address };
  const snap = parseGmgnCard(raw, target, at);
  expect(snap.nativeFees?.asset).toBe("ETH");
  const quote = (usd: number) => ({
    usd,
    last_updated_at: Date.parse(at) / 1000,
  });
  expect(
    convertFees(snap, { solana: quote(120), ethereum: quote(3000) }, at).metrics
      .totalFeesSolEquivalent.value,
  ).toBe(150);
  expect(
    convertFees(snap, { solana: quote(120), binancecoin: quote(600) }, at)
      .metrics.totalFeesSolEquivalent.value,
  ).toBeNull();
  expect(() =>
    parseGmgnCard(
      { ...raw, tokenLinks: [`https://etherscan.io/token/${address}`] },
      target,
      at,
    ),
  ).toThrow();
});
