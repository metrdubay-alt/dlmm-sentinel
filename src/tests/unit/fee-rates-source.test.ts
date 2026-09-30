import { expect, it, vi } from "vitest";
import { parseGmgnCard } from "../../shared/analysis/gmgn";
import { enrichFees } from "../../main/services/fee-rates-source";
const time = "2026-09-30T08:10:00.000Z";
const target = {
  chain: "robinhood" as const,
  address: "0xfd1a35778d9798f13c6fb97d29c07a5ce3f7fb5e",
};
const snapshot = () =>
  parseGmgnCard(
    {
      url: `https://gmgn.ai/robinhood/token/${target.address}`,
      tokenLinks: [`https://robin.etherscan.io/token/${target.address}`],
      info: { "Total Fees": "2.75" },
      risk: {},
      pool: {},
      tooltips: [],
      volumeText: "",
      volumePeriod: "",
      feeIcon: "IconRobinhoodeth16pxS",
    },
    target,
    time,
  );
it("uses fresh Coinbase USD quotes after CoinGecko 403 without rounding native fees", async () => {
  const fetcher = vi.fn(async (input: string | URL | Request) =>
    String(input).includes("coingecko")
      ? new Response("", { status: 403 })
      : Response.json({
          price: String(input).includes("SOL-USD") ? "100" : "2500",
          time,
        }),
  );
  const s = await enrichFees(
    snapshot(),
    fetcher as typeof fetch,
    () => new Date(time),
  );
  expect(s.metrics.totalFeesSolEquivalent.value).toBe(68.75);
  expect(s.feeConversion?.source).toBe("Coinbase");
  expect(s.nativeFees?.amount.value).toBe(2.75);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("does not use stale backup quotes or invent a conversion", async () => {
  const fetcher = (async (input: string | URL | Request) =>
    String(input).includes("coingecko")
      ? new Response("", { status: 429 })
      : Response.json({
          price: "100",
          time: "2026-09-29T00:00:00Z",
        })) as typeof fetch;
  const s = await enrichFees(snapshot(), fetcher, () => new Date(time));
  expect(s.metrics.totalFeesSolEquivalent.value).toBeNull();
  expect(s.nativeFees?.amount.value).toBe(2.75);
});
it("does not query backup when primary quotes are fresh", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({
      solana: { usd: 100, last_updated_at: Date.parse(time) / 1000 },
      ethereum: { usd: 2500, last_updated_at: Date.parse(time) / 1000 },
    }),
  );
  const s = await enrichFees(
    snapshot(),
    fetcher as typeof fetch,
    () => new Date(time),
  );
  expect(s.feeConversion?.source).toBe("CoinGecko");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
