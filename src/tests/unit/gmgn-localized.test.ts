import { expect, it } from "vitest";
import { parseGmgnCard } from "../../shared/analysis/gmgn";
const target = {
  chain: "robinhood" as const,
  address: "0xfd1a35778d9798f13c6fb97d29c07a5ce3f7fb5e",
};
it("reads Russian GMGN labels and exact holders separately from growth", () => {
  const s = parseGmgnCard(
    {
      url: `https://gmgn.ai/robinhood/token/${target.address}`,
      tokenLinks: [`https://robin.etherscan.io/token/${target.address}`],
      info: { "Топ 10": "14.58%", Holders: "1K 6%" },
      risk: { Фишинг: "24.5%" },
      pool: { Капитализация: "$800.10K", Holders: "1420" },
      tooltips: [],
      volumeText: "$371.3K",
      volumePeriod: "5m",
      feeIcon: "",
    },
    target,
    new Date().toISOString(),
  );
  expect(s.metrics.top10Pct.value).toBe(14.58);
  expect(s.metrics.phishingPct.value).toBe(24.5);
  expect(s.metrics.marketCapUsd.value).toBe(800100);
  expect(s.metrics.holderCount).toMatchObject({
    value: 1420,
    precision: "display",
  });
});
