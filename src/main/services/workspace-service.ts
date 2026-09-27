import type { BrowserWindow } from "electron";
import type { WorkspaceConfig } from "../../shared/analysis/workspace";
import { WorkspaceStore } from "./workspace-store";
import { GmgnStore } from "./gmgn-store";
import { MoniStore } from "./moni-store";
import { GmgnBrowser } from "./gmgn-browser";
import { MoniBrowser } from "./moni-browser";
import { XBrowser } from "./x-browser";
export class WorkspaceService {
  constructor(
    private store: WorkspaceStore,
    private gmgn: GmgnBrowser,
    private gmgnStore: GmgnStore,
    private moni: MoniBrowser,
    private moniStore: MoniStore,
    private x: XBrowser,
  ) {}
  async refresh(
    target: WorkspaceConfig["target"],
    parent: BrowserWindow,
    navigate: boolean,
    scope: "all" | "numeric" = "all",
  ) {
    const before = await this.store.report(target),
      errors: Record<string, string> = {};
    const read = async <T>(
      source: string,
      open: () => Promise<unknown>,
      capture: () => Promise<T>,
      save: (v: T) => Promise<unknown>,
    ) => {
      try {
        if (navigate) await open();
        let value: T | undefined;
        let error: unknown;
        for (let attempt = 0; attempt < (navigate ? 8 : 1); attempt++) {
          try {
            value = await capture();
            error = undefined;
            break;
          } catch (e) {
            error = e;
            if (navigate && attempt < 7)
              await new Promise((r) => setTimeout(r, 500));
          }
        }
        if (error) throw error;
        if (value !== undefined) await save(value);
      } catch {
        errors[source] = source.startsWith("moni")
          ? "Getmoni не вернул счёт. Проверьте загрузку профиля и доступный лимит."
          : `Не удалось прочитать ${source}. Откройте источник и повторите чтение.`;
      }
    };
    await read(
      "gmgn",
      () => this.gmgn.open(target, parent, true),
      () => this.gmgn.capture(target),
      (s) => this.gmgnStore.save(s),
    );
    if (scope === "numeric") {
      const retainedErrors = { ...before.errors };
      delete retainedErrors.gmgn;
      return this.store.finish(
        before,
        { ...retainedErrors, ...errors },
        new Date().toISOString(),
      );
    }
    const handle = before.config.handle;
    if (handle) {
      await read(
        "x",
        () => this.x.open(handle, parent, true),
        () => this.x.capture(handle),
        (s) => this.store.saveX(s),
      );
      if (before.config.moniEnabled !== false)
        await read(
          "moni",
          () => this.moni.open(handle, parent, true),
          () => this.moni.capture(handle),
          (s) => this.moniStore.save(s),
        );
    }
    if (before.config.moniEnabled !== false) {
      const handles = [
        ...new Set((before.config.relatedAccounts ?? []).map((a) => a.handle)),
      ].filter((h) => h !== handle);
      for (const related of handles) {
        // Without navigation only read the matching open profile, never another account's score.
        if (!navigate && !this.moni.isOpen(`https://app.moni.ai/${related}`))
          continue;
        await read(
          `moni:${related}`,
          () => this.moni.open(related, parent, true),
          () => this.moni.capture(related),
          (s) => this.moniStore.save(s),
        );
      }
    }
    return this.store.finish(before, errors, new Date().toISOString());
  }
}
