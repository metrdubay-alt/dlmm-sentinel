import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  parsePoolPage,
  withPoolCandles,
  rankPools,
} from "../../shared/analysis/pool-snapshot";
const target = {
  chain: "bsc" as const,
  address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
};
const p = {
  attributes: {
    address: "0x7a907a283ef913eb25bee3afd110f687a3fb7eed",
    name: "GSTOCK / USDT 1%",
    reserve_in_usd: "100000",
    volume_usd: { m5: "1000", h1: "5000" },
  },
  relationships: {
    base_token: { data: { id: `bsc_${target.address}` } },
    dex: { data: { id: "pancakeswap-v3-bsc" } },
  },
};
it("matches the original sheet on ZZZ's real trailing-empty Gecko response", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL("../fixtures/zzz-gecko-candles.json", import.meta.url),
      "utf8",
    ),
  );
  const pool = {
    ...parsePoolPage({ data: [p] }, target)[0],
    feePct: 2.8,
    tvlUsd: 400000,
  };
  const result = withPoolCandles(pool, fixture.response, fixture.end);
  // gcVolumes_ from GeckoPools.gs on this exact response: [0, 0, 626.020404694944, 626.020404694944].
  expect(result.sum5mUsd).toBe(0);
  expect(result.sum1hUsd).toBe(626.020404694944);
  expect(result.efficiency5m).toBe(0);
  expect(result.efficiency1h).toBeCloseTo(0.004382142832864608, 12);
  expect(result.issue).toBe("");
});
it("requires matching token relationships and preserves missing values", () => {
  expect(parsePoolPage({ data: [p] }, target)[0]).toMatchObject({
    tvlUsd: 100000,
    feePct: 1,
    volume5mUsd: 1000,
    volume1hUsd: 5000,
  });
  expect(
    parsePoolPage({ data: [{ ...p, relationships: {} }] }, target),
  ).toEqual([]);
  expect(
    parsePoolPage(
      {
        data: [
          {
            ...p,
            attributes: {
              ...p.attributes,
              reserve_in_usd: null,
              volume_usd: {},
            },
          },
        ],
      },
      target,
    )[0],
  ).toMatchObject({ tvlUsd: null, volume5mUsd: null });
});
it("uses actual minute sums and percentage units; missing minute means unknown", () => {
  const pool = parsePoolPage({ data: [p] }, target)[0];
  const list = Array.from({ length: 60 }, (_, i) => [
    3600 + i * 60,
    1,
    1,
    1,
    1,
    100,
  ]);
  const result = withPoolCandles(
    pool,
    { data: { attributes: { ohlcv_list: list } } },
    7200,
  );
  expect(result).toMatchObject({
    sum5mUsd: 500,
    sum1hUsd: 6000,
    efficiency5m: 0.005,
    efficiency1h: 0.06,
  });
  expect(
    withPoolCandles(
      pool,
      { data: { attributes: { ohlcv_list: list.slice(1) } } },
      7200,
    ).sum1hUsd,
  ).toBeNull();
});
it("ranks eligible pools by chosen actual window; unknowns and low TVL do not lead", () => {
  const base = parsePoolPage({ data: [p] }, target)[0];
  const rows = [
    { ...base, address: "a", efficiency5m: 1, efficiency1h: 2 },
    { ...base, address: "b", efficiency5m: 2, efficiency1h: 1 },
    { ...base, address: "c", tvlUsd: 100, efficiency5m: 99, efficiency1h: 99 },
  ];
  expect(rankPools(rows, "5m").map((p) => p.address)).toEqual(["b", "a", "c"]);
  expect(rankPools(rows, "1h").map((p) => p.address)).toEqual(["a", "b", "c"]);
});
