import { expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";

vi.mock("electron", () => ({ BrowserWindow: class {}, session: {} }));
vi.mock("../../main/services/transfer-fee", () => ({
  fetchTransferFee: async () => ({ status: "unknown" }),
}));
const { WorkspaceService } =
  await import("../../main/services/workspace-service");

it("shows why a GetMoni profile could not be read instead of a generic phrase", async () => {
  const target = { chain: "sol" as const, address: "x" };
  const before = {
    config: { target, handle: null, relatedAccounts: [] },
    errors: {},
  };
  const store = {
    report: async () => before,
    save: async (config: unknown) => ({ config, errors: {} }),
    finish: async (_b: unknown, errors: Record<string, string>) => errors,
  };
  const gmgn = {
    open: async () => true,
    capture: async () => ({}),
    socialLinks: async () => ["https://x.com/supercatsolgame"],
  };
  const moni = {
    isOpen: () => true,
    open: async () => true,
    capture: async () => {
      throw new Error("Точный Moni Score не найден.");
    },
  };
  const service = new WorkspaceService(
    store as never,
    gmgn as never,
    { save: async () => undefined } as never,
    moni as never,
    { save: async () => undefined } as never,
    {} as never,
  );
  const errors = (await service.refresh(
    target,
    {} as BrowserWindow,
    false,
  )) as unknown as Record<string, string>;
  expect(errors["moni:supercatsolgame"]).toBe(
    "Getmoni не вернул счёт: Точный Moni Score не найден.",
  );
});
