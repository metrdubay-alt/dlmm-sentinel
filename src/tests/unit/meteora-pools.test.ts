import { it, expect } from "vitest";
import {
  captureMeteora,
  meteoraVolumes,
} from "../../main/services/meteora-pools";
const address = "CbcyNo7m1amFWqEQm2m4PLv1UNvpcL3C1Ujm6AkzpKoU";
const pool = "HC7ArykAUSamJSAJ1aYLrS8aAamvBb1JvqMf1woUtnKo";
it("matches spreadsheet windows, excludes current boundary and rejects duplicate buckets", () => {
  const data = [
    { timestamp: 3300, volume: 100 },
    { timestamp: 3600, volume: 999 },
  ];
  expect(meteoraVolumes({ start_time: 0, end_time: 3600, data }, 3600)).toEqual(
    [100, 100, 100, 100],
  );
  expect(() =>
    meteoraVolumes(
      { start_time: 0, end_time: 3600, data: [...data, data[0]] },
      3600,
    ),
  ).toThrow();
  expect(() =>
    meteoraVolumes({ start_time: 1, end_time: 3600, data }, 3600),
  ).toThrow();
});
it("uses direct discovery, actual 5m volumes, dynamic fee and active TVL", async () => {
  const token_x = { address, symbol: "DEMO" },
    token_y = {
      address: "So11111111111111111111111111111111111111112",
      symbol: "SOL",
    };
  const requests: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const u = new URL(String(input));
    requests.push(u.href);
    if (u.hostname.startsWith("pool-discovery"))
      return Response.json({
        has_more: false,
        data: [
          {
            pool_address: pool,
            pool_type: "dlmm",
            token_x,
            token_y,
            tvl: 10000,
            active_tvl: 5000,
            fee_pct: 2,
            dlmm_params: { bin_step: 100 },
          },
        ],
      });
    if (u.pathname.endsWith("/history")) {
      const end = Number(u.searchParams.get("end_time"));
      return Response.json({
        start_time: end - 3600,
        end_time: end,
        data: Array.from({ length: 12 }, (_, i) => ({
          timestamp: end - (i + 1) * 300,
          volume: 100,
        })),
      });
    }
    return Response.json({
      address: pool,
      token_x,
      token_y,
      tvl: 10000,
      pool_config: { base_fee_pct: 2 },
      dynamic_fee_pct: 0.5,
    });
  }) as typeof fetch;
  const r = await captureMeteora({ chain: "sol", address }, fetcher);
  expect(r.source).toBe("Meteora");
  expect(r.rows).toHaveLength(1);
  expect(r.rows[0]).toMatchObject({
    sum5mUsd: 100,
    sum1hUsd: 1200,
    activeTvlUsd: 5000,
    efficiency5m: 0.05,
    efficiency1h: 0.6,
  });
  expect(requests.every((u) => u.includes("meteora.ag/"))).toBe(true);
});
