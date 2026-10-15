import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
import { gmgnChartHistoryScript } from "../../main/services/gmgn-chart-range";
const address = "Token123";
const now = Date.UTC(2026, 9, 15, 12, 5, 30);
const midnight = Date.UTC(2026, 9, 15);
async function capture(
  incomplete = false,
  changed = false,
  invalidVolume = false,
  missingBoundary = false,
) {
  const getBars = vi.fn((_symbol, resolution, period, ok) => {
    if (resolution === "1D") {
      if (period.to < midnight / 1000 - 86400)
        return ok(
          incomplete ? [{ time: midnight - 172800000, volume: 10 }] : [],
          { noData: !incomplete },
        );
      return ok(
        [
          { time: midnight - 86400000, volume: 100 },
          { time: midnight, volume: 999 },
        ],
        { noData: false },
      );
    }
    if (changed) location.pathname = "/sol/token/Other";
    ok(
      [
        {
          time: midnight - 60000,
          volume: 1000,
        },
        { time: midnight, volume: invalidVolume ? -2 : 2 },
        { time: midnight + 12 * 3600000 + 4 * 60000, volume: 3 },
        { time: midnight + 12 * 3600000 + 5 * 60000, volume: 90 },
      ].filter((b) => !missingBoundary || b.time > midnight),
      { noData: false },
    );
  });
  const location = {
    origin: "https://gmgn.ai",
    pathname: "/sol/token/" + address,
    href: "https://gmgn.ai/sol/token/" + address,
  };
  const frame = {
    id: "tradingview_test",
    contentWindow: {
      chartWidget: { getSymbol: () => `sol/${address}/USD/MCAP` },
    },
  };
  return runInNewContext(
    gmgnChartHistoryScript(
      { chain: "sol", address },
      new Date(now).toISOString(),
    ),
    {
      location,
      document: { querySelector: () => frame },
      window: { tradingview_test: { datafeed: { getBars } } },
      setTimeout,
      clearTimeout,
    },
  );
}
it("sums complete historical days and current-day completed minutes without double counting", async () => {
  const raw = await capture();
  expect(raw.volumeText).toBe("$105.00000000");
  expect(raw.latestCompletedEpochSeconds).toBe(
    (midnight + 12 * 3600000 + 4 * 60000) / 1000,
  );
});
it("rejects history without proof that its first candle was reached", async () =>
  expect(await capture(true)).toBeNull());
it("rejects navigation to another token during history capture", async () =>
  expect(await capture(false, true)).toBeNull());

it("rejects negative candle volumes", async () =>
  expect(await capture(false, false, true)).toBeNull());
it("rejects a minute tail without the day boundary", async () =>
  expect(await capture(false, false, false, true)).toBeNull());
