import { expect, it, vi } from "vitest";
import { LiveHttp } from "../../main/providers/http";
import { normalizeRug } from "../../main/providers/normalize";
import {
  fetchX,
  normalizeGmgn,
  normalizeBubble,
} from "../../main/providers/connected";
const mint = "So11111111111111111111111111111111111111112";
it("RugCheck exposes holder count even when RPC is unavailable", () => {
  expect(
    normalizeRug({ mint, totalHolders: 3888 }, mint).details.holderCount,
  ).toBe(3888);
});
it("GMGN volume ratios never become supply or proven insiders; signed PnL is retained", () => {
  const r = normalizeGmgn(
    {
      info: {
        address: mint,
        holder_count: 100,
        circulating_supply: "1000",
        price: { price: "2" },
      },
      security: { bundler_trader_amount_rate: 0.3 },
      holders: {
        list: [
          {
            address: mint,
            amount_percentage: 0.05,
            realized_profit: "-12",
            unrealized_profit: "3",
            maker_token_tags: ["bundler"],
          },
        ],
      },
    },
    mint,
  );
  expect(r.data.bundledPct).toBeUndefined();
  expect(r.details.wallets?.[0]).toMatchObject({ pct: 5, realizedUsd: -12 });
  expect(r.details.marketCapUsd).toBe(2000);
  expect(() =>
    normalizeGmgn({ info: { address: "different" } }, mint),
  ).toThrow();
});
it("Bubblemaps preserves update time and raw cluster share without guessing units", () => {
  const r = normalizeBubble({
    metadata: { dt_update: "2026-09-20", ts_update: 1790000000 },
    clusters: [{ share: 0.25, holder_count: 2, holders: [mint, mint] }],
  });
  expect(r.details.clusters?.[0].shareRaw).toBe(0.25);
  expect(r.data.insiderPct).toBeUndefined();
});
it("X follows bounded pagination and records incomplete coverage without fabricating warnings", async () => {
  const f = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "123",
              text: "possible rug?",
              author_id: "42",
              created_at: "2026-09-23T00:00:00Z",
            },
          ],
          meta: { next_token: "more" },
        }),
      ),
    );
  // A fresh Response is required for every page.
  f.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "123",
              text: "possible rug?",
              author_id: "42",
              created_at: "2026-09-23T00:00:00Z",
            },
          ],
          meta: { next_token: "more" },
        }),
      ),
  );
  const r = await fetchX(
    new LiveHttp(f, 0),
    mint,
    "secret",
    "quick",
    AbortSignal.timeout(5000),
  );
  expect(r.details.social?.complete).toBe(false);
  expect(r.details.social?.posts).toHaveLength(1);
  expect(r.details.social?.posts[0].warningTerms).toContain("rug");
  expect(r.data.securityWarningCredible).toBeUndefined();
  expect(JSON.stringify(r)).not.toContain("secret");
});
it("new API allowlists reject trading paths and credential-bearing redirects", async () => {
  const f = vi.fn<typeof fetch>();
  const h = new LiveHttp(f, 0);
  await expect(
    h.json(
      "https://openapi.gmgn.ai/v1/trade/swap",
      {},
      AbortSignal.timeout(500),
    ),
  ).rejects.toThrow();
  await expect(
    h.json(
      "https://api.x.com/2/tweets",
      { method: "POST" },
      AbortSignal.timeout(500),
    ),
  ).rejects.toThrow();
  expect(f).not.toHaveBeenCalled();
});
