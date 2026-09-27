import { it, expect, vi } from "vitest";
import {
  runTokenAnalysis,
  type AnalysisApi,
} from "../../renderer/lib/run-token-analysis";
import type { WorkspaceReport } from "../../shared/analysis/workspace";
const config = {
  target: {
    chain: "bsc" as const,
    address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
  },
  label: "",
  handle: null,
  monitor: false,
  intervalMinutes: 15 as const,
};
function harness() {
  let r: WorkspaceReport = {
    config,
    lastAttempt: null,
    errors: {},
    alerts: [],
    research: [],
    gmgn: null,
    moni: null,
    x: null,
    grok: null,
  };
  const api = {
    workspaceList: vi.fn(async () => []),
    workspaceSave: vi.fn(async () => r),
    workspaceRefresh: vi.fn(async () => r),
    workspaceReport: vi.fn(async () => r),
    grokRun: vi.fn(async () => {
      r = { ...r, config: { ...config, label: "DEMO", handle: "example" } };
      return r;
    }),
    poolsRefresh: vi.fn(async () => ({ rows: [] })),
  } as unknown as AnalysisApi;
  return { api, events: { report: vi.fn(), stage: vi.fn(), pools: vi.fn() } };
}
it("one launch saves address, runs all sources and discovers X before social refresh", async () => {
  const h = harness();
  const r = await runTokenAnalysis(config, h.api, h.events);
  expect(h.api.workspaceSave).toHaveBeenCalledOnce();
  expect(h.api.grokRun).toHaveBeenCalledOnce();
  expect(h.api.poolsRefresh).toHaveBeenCalledOnce();
  expect(h.api.workspaceRefresh).toHaveBeenCalledTimes(2);
  expect(r.config.handle).toBe("example");
  expect(h.events.stage).toHaveBeenCalledWith("social", {
    state: "done",
    detail: "Готово",
  });
});
it("quota/pool failure does not suppress numeric data or publish success", async () => {
  const h = harness();
  vi.mocked(h.api.grokRun).mockRejectedValue(new Error("Лимит Grok"));
  vi.mocked(h.api.poolsRefresh).mockRejectedValue(new Error("429"));
  await runTokenAnalysis(config, h.api, h.events);
  expect(h.api.workspaceRefresh).toHaveBeenCalledOnce();
  expect(h.events.stage).toHaveBeenCalledWith("grok", {
    state: "error",
    detail: "Лимит Grok",
  });
  expect(h.events.stage).toHaveBeenCalledWith("pools", {
    state: "error",
    detail: "429",
  });
  expect(h.events.stage).toHaveBeenCalledWith(
    "social",
    expect.objectContaining({ state: "skipped" }),
  );
});
it("invalid address never saves or starts a source", async () => {
  const h = harness();
  await expect(
    runTokenAnalysis(
      { ...config, target: { ...config.target, address: "bad" } },
      h.api,
      h.events,
    ),
  ).rejects.toThrow();
  expect(h.api.workspaceSave).not.toHaveBeenCalled();
  expect(h.api.grokRun).not.toHaveBeenCalled();
});
it("retries a late GMGN page once without navigating or resending Grok", async () => {
  const h = harness();
  const r = await h.api.workspaceReport(config.target);
  vi.mocked(h.api.grokRun).mockResolvedValue(r);
  vi.mocked(h.api.workspaceRefresh)
    .mockResolvedValueOnce({ ...r, errors: { gmgn: "Loading" } })
    .mockResolvedValueOnce(r);
  await runTokenAnalysis(config, h.api, h.events);
  expect(h.api.workspaceRefresh).toHaveBeenCalledTimes(2);
  expect(h.api.workspaceRefresh).toHaveBeenLastCalledWith({
    target: config.target,
    navigate: false,
  });
  expect(h.api.grokRun).toHaveBeenCalledOnce();
  expect(
    h.events.stage.mock.calls.filter(([name]) => name === "gmgn").at(-1),
  ).toEqual([
    "gmgn",
    {
      state: "done",
      detail: "Готово",
    },
  ]);
});
