import { MoniReadError } from "../../shared/analysis/moni";
import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { openDatabase, type Database } from "../../main/services/database";
import { WorkspaceStore } from "../../main/services/workspace-store";
import { WorkspaceService } from "../../main/services/workspace-service";
import { GmgnStore } from "../../main/services/gmgn-store";
import { MoniStore } from "../../main/services/moni-store";
import type { GmgnBrowser } from "../../main/services/gmgn-browser";
import type { MoniBrowser } from "../../main/services/moni-browser";
import type { XBrowser } from "../../main/services/x-browser";
import { parseGmgnCard } from "../../shared/analysis/gmgn";

let db: Database | undefined, dir: string | undefined;
afterEach(async () => {
  await db?.$disconnect();
  if (dir) await rm(dir, { recursive: true, force: true });
});
it("continues GMGN and X while Moni is disabled, and resumes Moni when enabled", async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sentinel-source-test-"));
  db = await openDatabase(dir, path.resolve("prisma/migrations"));
  const store = new WorkspaceStore(db);
  const target = {
    chain: "bsc" as const,
    address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
  };
  const config = {
    target,
    label: "test",
    handle: "gstockbsc",
    monitor: false,
    intervalMinutes: 15 as const,
    moniEnabled: false,
  };
  await store.save(config);
  const at = "2026-09-26T15:00:00.000Z";
  const gmgn = parseGmgnCard(
    {
      url: `https://gmgn.ai/bsc/token/${target.address}`,
      tokenLinks: [`https://bscscan.com/token/${target.address}`],
      info: {},
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
  let moniReads = 0;
  const service = new WorkspaceService(
    store,
    {
      capture: async () => gmgn,
      socialLinks: async () => [],
    } as unknown as GmgnBrowser,
    new GmgnStore(db),
    {
      capture: async () => {
        moniReads++;
        throw new Error("daily limit");
      },
    } as unknown as MoniBrowser,
    new MoniStore(db),
    {
      capture: async () => ({
        handle: "gstockbsc",
        sourceUrl: "https://x.com/gstockbsc",
        observedAt: at,
        state: "available",
        official: false,
        bio: "test",
        website: "",
        joined: "",
        followers: 2000,
        following: 10,
        posts: [],
        coverage: "visible-sample",
        unavailableText: "",
      }),
    } as unknown as XBrowser,
  );
  const paused = await service.refresh(target, {} as BrowserWindow, false);
  expect(moniReads).toBe(0);
  expect(paused.report.errors).toEqual({});
  expect(paused.report.gmgn?.target).toEqual(target);
  expect(paused.report.x?.followers).toBe(2000);
  expect(paused.events).toEqual([]);
  await store.save({ ...config, moniEnabled: true });
  const resumed = await service.refresh(target, {} as BrowserWindow, false);
  expect(moniReads).toBe(1);
  expect(resumed.report.errors.moni).toBeTruthy();
  const oldX = resumed.report.x;
  const numeric = await service.refresh(
    target,
    {} as BrowserWindow,
    false,
    "numeric",
  );
  expect(moniReads).toBe(1);
  expect(numeric.report.x).toEqual(oldX);
  expect(numeric.report.errors.moni).toBe(resumed.report.errors.moni);
  expect(numeric.report.gmgn?.target).toEqual(target);
});
it("stores a related account score despite missing project score and reloads it independently", async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sentinel-related-test-"));
  db = await openDatabase(dir, path.resolve("prisma/migrations"));
  const store = new WorkspaceStore(db);
  const target = {
    chain: "robinhood" as const,
    address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
  };
  await store.save({
    target,
    label: "DEMO",
    handle: "project",
    monitor: false,
    intervalMinutes: 15,
    relatedAccounts: [
      {
        handle: "recipient",
        role: "fee_recipient",
        source: "https://example.com/token",
        attribution: "reviewed",
      },
    ],
  });
  const reads: string[] = [];
  const service = new WorkspaceService(
    store,
    { socialLinks: async () => [] } as unknown as GmgnBrowser,
    new GmgnStore(db),
    {
      isOpen: () => true,
      capture: async (handle: string) => {
        reads.push(handle);
        if (handle === "project")
          throw new MoniReadError(
            "not-found",
            "GetMoni: профиль @project не найден.",
          );
        return {
          handle,
          sourceUrl: `https://app.moni.ai/${handle}`,
          observedAt: new Date().toISOString(),
          score: 10949,
          smarts: 123,
          visibleSmarts: [],
          listComplete: false,
          source: "moni-browser",
          parserVersion: "moni-dom-1",
        };
      },
    } as unknown as MoniBrowser,
    new MoniStore(db),
    {
      capture: async () => {
        throw Error("X unavailable");
      },
    } as unknown as XBrowser,
  );
  const { report } = await service.refresh(target, {} as BrowserWindow, false);
  expect(reads).toEqual(["project", "recipient"]);
  expect(report.moni).toBeNull();
  expect(report.relatedMoni?.[0].snapshot?.score).toBe(10949);
  expect(report.errors.moni).toBe("GetMoni: профиль @project не найден.");
  expect(report.errors.moni).not.toContain("лимит");
  const restored = await new WorkspaceStore(db).report(target);
  expect(restored.config.handle).toBe("project");
  expect(restored.config.relatedAccounts?.[0].role).toBe("fee_recipient");
  expect(restored.relatedMoni?.[0].snapshot?.handle).toBe("recipient");
});

it("reads a GMGN-linked profile without any Grok account discovery", async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sentinel-linked-moni-"));
  db = await openDatabase(dir, path.resolve("prisma/migrations"));
  const store = new WorkspaceStore(db);
  const target = {
    chain: "bsc" as const,
    address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
  };
  await store.save({
    target,
    label: "BAGSPAY",
    handle: null,
    relatedAccounts: [],
    monitor: false,
    intervalMinutes: 15,
  });
  const opened: string[] = [];
  const service = new WorkspaceService(
    store,
    {
      open: async () => true,
      capture: async () => {
        throw Error("numeric unavailable");
      },
      socialLinks: async () => ["https://x.com/BagsPay"],
    } as unknown as GmgnBrowser,
    new GmgnStore(db),
    {
      open: async (h: string) => {
        opened.push(h);
      },
      capture: async (h: string) => ({
        handle: h,
        sourceUrl: `https://app.moni.ai/${h}`,
        observedAt: new Date().toISOString(),
        score: 115,
        smarts: 10,
        visibleSmarts: [],
        listComplete: false,
        source: "moni-browser",
        parserVersion: "moni-profile-1",
      }),
    } as unknown as MoniBrowser,
    new MoniStore(db),
    {} as XBrowser,
  );
  const r = await service.refresh(target, {} as BrowserWindow, true);
  expect(opened).toEqual(["bagspay"]);
  expect(r.report.config.handle).toBeNull();
  expect(r.report.config.relatedAccounts).toContainEqual({
    handle: "bagspay",
    role: "source_link",
    source: `https://gmgn.ai/bsc/token/${target.address}`,
    attribution: "gmgn",
  });
  expect(r.report.relatedMoni?.[0].snapshot?.score).toBe(115);
});
