import { expect, it } from "vitest";
import {
  parseGmgnCard,
  gmgnTargetSchema,
  gmgnStrategyInput,
  holderPressure,
} from "../../shared/analysis/gmgn";
const address = "F9PvspnWkP3hSLaYxQb2LvFRBgyrLVhdUJ5q39tZZPbC";
const target = { chain: "sol" as const, address };
const card = {
  url: `https://gmgn.ai/sol/token/${address}`,
  tokenLinks: [`https://solscan.io/token/${address}#metadata`],
  info: { "Top 10": "21.52%", Holders: "1,211", "Total Fees": "32.35" },
  risk: { Bundler: "20%", Phishing: "2.5%" },
  pool: { "Market cap": "$146.33K" },
  tooltips: ["Bundlers hold\n19.97%\nATH hold\n19.97%"],
  volumeText: "$100,001",
  volumePeriod: "5m",
  feeIcon: "IconSolanabal14pxS",
};
const read = (patch = {}) =>
  parseGmgnCard({ ...card, ...patch }, target, "2026-09-25T18:00:00.000Z");
it("reads exact watcher integers and rejects rounded or missing counts for scoring", () => {
  expect(gmgnStrategyInput(read({ watchersText: "1,234" })).watchers).toBe(
    1234,
  );
  for (const watchersText of ["", "1.2K", "12.5", "--"])
    expect(gmgnStrategyInput(read({ watchersText })).watchers).toBeNull();
});
it("uses InfoItem top10 and the precise bundlers tooltip", () => {
  const s = read();
  expect(s.metrics.top10Pct.value).toBe(21.52);
  expect(s.metrics.bundlersPct.value).toBe(19.97);
  expect(s.metrics.holderCount.value).toBe(1211);
  expect(s.metrics.totalFeesSolEquivalent.value).toBe(32.35);
});
it("does not substitute compact bundlers value when tooltip is absent", () =>
  expect(gmgnStrategyInput(read({ tooltips: [] })).bundlersPct).toBeNull());
it("retains compact amounts for display but excludes them from exact scoring", () => {
  const s = read();
  expect(s.metrics.marketCapUsd.value).toBe(146330);
  expect(s.metrics.marketCapUsd.precision).toBe("rounded");
  expect(gmgnStrategyInput(s).marketCapUsd).toBeNull();
});
it("does not read hourly volume as five-minute volume", () =>
  expect(
    gmgnStrategyInput(read({ volumePeriod: "1h" })).volume5mUsd,
  ).toBeNull());
it("does not treat a different coin's fees as SOL", () =>
  expect(
    gmgnStrategyInput(read({ feeIcon: "IconBnb" })).totalFeesSolEquivalent,
  ).toBeNull());
it("rejects a different page or token identity", () => {
  expect(() => read({ url: `https://gmgn.ai/bsc/token/${address}` })).toThrow();
  expect(() => read({ tokenLinks: [] })).toThrow();
  expect(() =>
    read({ url: `https://gmgn.ai.evil.test/sol/token/${address}` }),
  ).toThrow();
});
it("checks chain and address instead of accepting a ticker", () => {
  expect(
    gmgnTargetSchema.safeParse({ chain: "sol", address: "BRICK" }).success,
  ).toBe(false);
  expect(
    gmgnTargetSchema.safeParse({
      chain: "bsc",
      address: "0x2e8c31162b855a2ffa90f6f8634643ad6f111e18",
    }).success,
  ).toBe(true);
});
it("leaves the bundlers profit ranking and first-trade age unknown", () => {
  const x = gmgnStrategyInput(read());
  expect(x.ageDays).toBeNull();
  expect(x.bundlerRankingComplete).toBe(false);
  expect(x.bundlerProfitTop10).toBeUndefined();
});

const wallet = "HRo7TZ1gDNhjTfoubRmFpyfZreGxqC1Sjet6w8TkD3R4";
const holder = {
  address: wallet,
  tags: ["bundler"],
  unrealized: "+$12,000\n+1200.25%",
  remaining: "$15,000\n1.5%",
};
it("captures unrealized ROI separately and keeps the holder sample incomplete", () => {
  const s = read({ holders: [holder], holdersState: "partial" });
  expect(s.holders?.rows[0].unrealizedRoiPct).toBe(1200.25);
  expect(s.holders?.rows[0].remainingUsd.value).toBe(15000);
  expect(s.holders?.complete).toBe(false);
});
it("rejects conflicting duplicate wallets instead of double counting", () => {
  const s = read({
    holders: [holder, { ...holder, remaining: "$25,000\n2.5%" }],
    holdersState: "partial",
  });
  expect(s.holders?.rows).toEqual([]);
  expect(s.holders?.conflictingAddresses).toEqual([wallet]);
});
it("deduplicates identical rows and never substitutes a missing ROI with zero", () => {
  const row = { ...holder, unrealized: "+$0" };
  const s = read({ holders: [row, row], holdersState: "partial" });
  expect(s.holders?.rows).toHaveLength(1);
  expect(s.holders?.rows[0].unrealizedRoiPct).toBeNull();
});
it("preserves losses and treats an empty filtered table as unavailable", () => {
  const s = read({
    holders: [{ ...holder, unrealized: "-$20\n-99.5%" }],
    holdersState: "partial",
  });
  expect(s.holders?.rows[0].unrealizedUsd.value).toBe(-20);
  expect(read({ holders: [], holdersState: "empty" }).holders?.state).toBe(
    "empty",
  );
});
it("ranks large losing positions separately from profitable tiny positions", () => {
  const s = read({
    holdersState: "partial",
    holders: [
      { ...holder, unrealized: "-$2,000\n-50%", remaining: "$30,000\n3%" },
      {
        ...holder,
        address,
        unrealized: "+$19\n+5000%",
        remaining: "$20\n0.01%",
      },
    ],
  });
  const p = holderPressure(s);
  expect(p.byPosition[0].address).toBe(wallet);
  expect(p.byProfit[0].address).toBe(address);
});
it("does not rank unknown or zero remaining balances as active sellers", () => {
  const s = read({
    holdersState: "partial",
    holders: [
      { ...holder, remaining: "$0\n0%" },
      { ...holder, address, remaining: "--" },
    ],
  });
  expect(holderPressure(s).byProfit).toEqual([]);
  expect(holderPressure(s).unknownBalanceCount).toBe(1);
});
it("compares remaining position with the displayed pool, retaining approximate precision", () => {
  const s = read({
    pool: { "Total liq": "$50K(100 BP)" },
    holders: [{ ...holder, remaining: "$30,000\n3%" }],
    holdersState: "partial",
  });
  expect(s.displayedPoolLiquidity?.value).toBe(50000);
  expect(holderPressure(s).byPosition[0].positionToPoolPct).toBe(60);
  expect(s.displayedPoolLiquidity?.precision).toBe("rounded");
  expect(
    holderPressure(read({ holders: [holder], holdersState: "partial" }))
      .byPosition[0].positionToPoolPct,
  ).toBeNull();
});

it("keeps every numeric field separate and never converts a missing DEV share into zero", () => {
  const s = read({
    info: {
      "Top 10": "13.33%",
      Holders: "4,049",
      Snipers: "1.2%",
      DEV: "0.61%",
      "Total Fees": "75.75",
    },
    pool: { "Market cap": "$723.69K", Holders: "4049" },
    risk: { Bundler: "33.4%", Phishing: "5.9%" },
    tooltips: [],
    watchersText: "336",
    volumeText: "$73.2K",
    volumePeriod: "5m",
  });
  expect(
    Object.fromEntries(
      Object.entries(s.metrics).map(([key, m]) => [key, m.value]),
    ),
  ).toEqual({
    top10Pct: 13.33,
    bundlersPct: 33.4,
    phishingPct: 5.9,
    holderCount: 4049,
    marketCapUsd: 723690,
    volume5mUsd: 73200,
    volume1hUsd: null,
    totalFeesSolEquivalent: 75.75,
    snipersPct: 1.2,
    devPct: 0.61,
  });
  expect(s.watchers?.value).toBe(336);
  expect(read({ info: { DEV: "0%" } }).metrics.devPct.value).toBe(0);
  expect(read({ info: {} }).metrics.devPct.value).toBeNull();
  const hour = read({ volumeText: "$923.9K", volumePeriod: "1h" });
  expect(hour.metrics.volume1hUsd.value).toBe(923900);
  expect(hour.metrics.volume5mUsd.value).toBeNull();
});
