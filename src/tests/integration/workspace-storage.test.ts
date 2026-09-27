import { afterEach, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Database } from "../../main/services/database";
import { WorkspaceStore } from "../../main/services/workspace-store";
import { DatabaseCache } from "../../main/services/live-cache";
import type { Snapshot } from "../../shared/schemas/domain";
let db: Database | undefined, dir: string | undefined;
afterEach(async () => {
  await db?.$disconnect();
  if (dir) await rm(dir, { recursive: true, force: true });
});
it("persists reports, deduplicates source errors and protects research from transient cache cleanup", async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sentinel-workspace-"));
  db = await openDatabase(dir, path.resolve("prisma/migrations"));
  const store = new WorkspaceStore(db);
  const target = {
    chain: "bsc" as const,
    address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
  };
  const before = await store.save({
    target,
    label: "GSTOCK",
    handle: "gstockbsc",
    monitor: false,
    intervalMinutes: 15,
  });
  const first = await store.finish(
    before,
    { x: "Вход не выполнен" },
    "2026-09-26T00:00:00.000Z",
  );
  expect(first.events).toHaveLength(1);
  const second = await store.finish(
    first.report,
    { x: "Вход не выполнен" },
    "2026-09-26T00:05:00.000Z",
  );
  expect(second.events).toHaveLength(0);
  await expect(
    store.research({
      target,
      handle: "other",
      input: {
        mint: target.address,
        description: "",
        projectType: "unknown",
        observations: [],
        flags: [],
      },
      origin: "user",
      savedAt: "2026-09-26T00:00:00.000Z",
    }),
  ).rejects.toThrow();
  await db.liveCache.updateMany({
    data: { updatedAt: new Date("2020-01-01") },
  });
  await new DatabaseCache(db).put("transient", {} as Snapshot);
  expect((await store.report(target)).alerts).toHaveLength(1);
});
it("deletes only the chosen chain card and token caches, preserving shared profiles", async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sentinel-delete-"));
  db = await openDatabase(dir, path.resolve("prisma/migrations"));
  const store = new WorkspaceStore(db);
  const address = "0xcafdbce93477261db8250e42bdae6e66733f9e20";
  const target = { chain: "bsc" as const, address };
  for (const chain of ["bsc", "eth"] as const)
    await store.save({
      target: { chain, address },
      label: "test",
      handle: "shared",
      monitor: false,
      intervalMinutes: 15,
    });
  for (const key of [
    `gmgn-history:bsc:${address}`,
    `pool-snapshot:bsc:${address}`,
    "moni-history:shared",
  ])
    await db.liveCache.create({ data: { key, snapshotJson: "[]" } });
  await store.remove(target);
  expect((await store.list()).map((x) => x.config.target.chain)).toEqual([
    "eth",
  ]);
  await expect(store.report(target)).rejects.toThrow();
  expect(
    await db.liveCache.findUnique({
      where: { key: `gmgn-history:bsc:${address}` },
    }),
  ).toBeNull();
  expect(
    await db.liveCache.findUnique({
      where: { key: `pool-snapshot:bsc:${address}` },
    }),
  ).toBeNull();
  expect(
    await db.liveCache.findUnique({ where: { key: "moni-history:shared" } }),
  ).not.toBeNull();
});
