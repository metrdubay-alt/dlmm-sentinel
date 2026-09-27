import type { Api } from "../../shared/schemas/ipc";
import {
  workspaceConfigSchema,
  tokenKey,
  type WorkspaceConfig,
  type WorkspaceReport,
} from "../../shared/analysis/workspace";
export type AnalysisStage = "gmgn" | "grok" | "social" | "pools";
export type StageState = {
  state: "waiting" | "running" | "done" | "partial" | "error" | "skipped";
  detail: string;
};
export type AnalysisApi = Pick<
  Api,
  | "workspaceList"
  | "workspaceSave"
  | "workspaceRefresh"
  | "workspaceReport"
  | "grokRun"
  | "poolsRefresh"
>;
export async function runTokenAnalysis(
  draft: WorkspaceConfig,
  api: AnalysisApi,
  events: {
    report: (r: WorkspaceReport) => void;
    stage: (s: AnalysisStage, v: StageState) => void;
    pools: (p: Awaited<ReturnType<Api["poolsRefresh"]>>) => void;
  },
) {
  let config = workspaceConfigSchema.parse(draft);
  const existing = (await api.workspaceList(undefined)).find(
    (x) => tokenKey(x.config.target) === tokenKey(config.target),
  );
  if (existing)
    config = {
      ...config,
      label: config.label || existing.config.label,
      handle: config.handle || existing.config.handle,
      relatedAccounts:
        config.relatedAccounts ?? existing.config.relatedAccounts,
    };
  const saved = await api.workspaceSave(config);
  events.report(saved);
  const stage = async (name: AnalysisStage, job: () => Promise<void>) => {
    events.stage(name, { state: "running", detail: "Выполняется…" });
    try {
      await job();
    } catch (e) {
      events.stage(name, {
        state: "error",
        detail: e instanceof Error ? e.message : "Не удалось получить данные",
      });
    }
  };
  let retryNumeric = false;
  const publishRefresh = async (name: AnalysisStage, navigate = true) => {
    const r = await api.workspaceRefresh({
      target: config.target,
      navigate,
    });
    events.report(r);
    if (name === "gmgn") retryNumeric = !!r.errors.gmgn;
    const errors = Object.entries(r.errors).filter(([key]) =>
      name === "gmgn"
        ? key === "gmgn"
        : key === "x" || key === "moni" || key.startsWith("moni:"),
    );
    events.stage(name, {
      state: errors.length ? "partial" : "done",
      detail: errors.length
        ? errors.map(([key, v]) => `${key}: ${v}`).join(" ")
        : "Готово",
    });
  };
  // GMGN is read immediately. X/Moni are refreshed after Grok discovers the profile.
  const numeric = stage("gmgn", async () => {
    await publishRefresh("gmgn");
  });
  const pools = () =>
    stage("pools", async () => {
      const p = await api.poolsRefresh(config.target);
      events.pools(p);
      events.stage("pools", {
        state: p.rows.length ? "done" : "partial",
        detail: p.rows.length ? "Готово" : "Подходящие пулы не найдены",
      });
    });
  const social = (async () => {
    let found: WorkspaceReport | undefined;
    await stage("grok", async () => {
      found = await api.grokRun(config.target);
      events.report(found);
      events.stage("grok", { state: "done", detail: "Ответ сохранён" });
    });
    await numeric;
    if (!(
      found?.config.handle ||
      saved.config.handle ||
      found?.config.relatedAccounts?.length ||
      saved.config.relatedAccounts?.length
    )) {
      events.stage("social", {
        state: "skipped",
        detail: "Профиль X не найден; X/Getmoni пока недоступны",
      });
      return;
    }
    await stage("social", () => publishRefresh("social"));
  })();
  await Promise.all([numeric, social]);
  // A newly opened GMGN page can finish hydrating after its initial read.
  // Retry once without reloading the page or resending the Grok request.
  if (retryNumeric) await stage("gmgn", () => publishRefresh("gmgn", false));
  // Pool discovery shares the main-process queue with source persistence.
  // Save social results first so a long pool scan cannot hide them.
  await pools();
  const final = await api.workspaceReport(config.target);
  events.report(final);
  return final;
}
