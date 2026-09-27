import { expect, it } from "vitest";
import {
  workspaceConfigSchema,
  monitorSignals,
} from "../../shared/analysis/workspace";
import { parseGmgnCard } from "../../shared/analysis/gmgn";
const target = {
  chain: "sol" as const,
  address: "F9PvspnWkP3hSLaYxQb2LvFRBgyrLVhdUJ5q39tZZPbC",
};
const snap = (top: string, at: string) =>
  parseGmgnCard(
    {
      url: `https://gmgn.ai/sol/token/${target.address}`,
      tokenLinks: [`https://solscan.io/token/${target.address}`],
      info: { "Top 10": top },
      risk: {},
      pool: {},
      tooltips: [],
      volumeText: "",
      volumePeriod: "5m",
      feeIcon: "",
    },
    target,
    at,
  );
it("restricts monitor cadence and validates chain identity", () => {
  expect(
    workspaceConfigSchema.safeParse({
      target,
      label: "Test",
      handle: null,
      monitor: true,
      intervalMinutes: 1,
    }).success,
  ).toBe(false);
});
it("alerts a new veto, not a repeated veto or cross-token difference", () => {
  const old = snap("21%", "2026-09-26T00:00:00.000Z"),
    current = snap("22%", "2026-09-26T00:05:00.000Z");
  expect(
    monitorSignals({ gmgn: current }, { gmgn: old }).some(
      (x) => x.code === "VETO_TOP10_22",
    ),
  ).toBe(true);
  expect(
    monitorSignals(
      { gmgn: current },
      { gmgn: { ...old, metrics: current.metrics } },
    ),
  ).toEqual([]);
  expect(
    monitorSignals(
      { gmgn: current },
      {
        gmgn: {
          ...old,
          target: {
            ...target,
            address: "So11111111111111111111111111111111111111112",
          },
        },
      },
    ),
  ).toEqual([]);
});
it("Moni decline does not claim specific smart unfollows", () => {
  const old = {
    handle: "gstockbsc",
    sourceUrl: "https://app.moni.ai/gstockbsc",
    observedAt: "2026-09-26T00:00:00.000Z",
    score: 100,
    smarts: 2,
    visibleSmarts: ["a"],
    listComplete: false as const,
    source: "moni-browser" as const,
    parserVersion: "moni-dom-1" as const,
  };
  const signals = monitorSignals(
    { moni: { ...old, score: 6, observedAt: "2026-09-26T00:05:00.000Z" } },
    { moni: old },
  );
  expect(signals[0].code).toBe("MONI_SCORE_DOWN");
  expect(signals[0].text).not.toContain("отписался");
});

it("does not treat missing intermediate metrics as cleared vetoes", () => {
  const old = snap("23%", "2026-09-26T00:00:00.000Z");
  const missing = snap("", "2026-09-26T00:05:00.000Z");
  const current = snap("23%", "2026-09-26T00:10:00.000Z");
  expect(monitorSignals({ gmgn: missing }, { gmgn: old })).toEqual([]);
  expect(monitorSignals({ gmgn: current }, { gmgn: missing })).toEqual([]);
  const exact = { display: "30%", value: 30, precision: "display" as const };
  const combined = {
    ...current,
    metrics: {
      ...current.metrics,
      top10Pct: { ...exact, value: 10, display: "10%" },
      bundlersPct: exact,
      phishingPct: exact,
    },
  };
  expect(monitorSignals({ gmgn: combined }, { gmgn: missing })).toEqual([]);
});
