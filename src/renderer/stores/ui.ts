import { create } from "zustand";
import type { Report } from "../../shared/schemas/domain";
import type { WorkspaceConfig } from "../../shared/analysis/workspace";
type Page =
  | "workspace"
  | "dashboard"
  | "scan"
  | "numeric"
  | "report"
  | "settings"
  | "watchlist"
  | "positions";
export const useUi = create<{
  page: Page;
  workspaceConfig: WorkspaceConfig | null;
  setWorkspace: (config: WorkspaceConfig | null) => void;
  report: Report | null;
  setPage: (page: Page) => void;
  setReport: (report: Report | null) => void;
}>((set) => ({
  page: "workspace",
  workspaceConfig: null,
  setWorkspace: (workspaceConfig) =>
    set({ workspaceConfig, page: "workspace" }),
  report: null,
  setPage: (page) => set({ page }),
  setReport: (report) => set({ report, page: report ? "report" : "dashboard" }),
}));
