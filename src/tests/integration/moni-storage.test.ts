import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Database } from "../../main/services/database";
import { MoniStore } from "../../main/services/moni-store";
import { DatabaseCache } from "../../main/services/live-cache";
import type { Snapshot } from "../../shared/schemas/domain";
import { parseMoniCard } from "../../shared/analysis/moni";
let db: Database | undefined;
let dir: string | undefined;
afterEach(async () => {
  await db?.$disconnect();
  if (dir) await rm(dir, { recursive: true, force: true });
});
it("persists profile history across reopen, separates accounts and retains the latest 100", async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sentinel-moni-test-"));
  const migrations = path.resolve("prisma/migrations");
  db = await openDatabase(dir, migrations);
  let store = new MoniStore(db);
  const snapshot = parseMoniCard(
    {
      url: "https://app.moni.ai/example",
      profileHref: "https://x.com/example",
      scoreText: "100",
      smartsText: "10",
      smartHrefs: [],
    },
    "example",
    "2026-09-25T00:00:00.000Z",
  );
  for (let i = 0; i < 102; i++)
    await store.save({
      ...snapshot,
      score: i,
      observedAt: new Date(
        Date.parse(snapshot.observedAt) + i * 1000,
      ).toISOString(),
    });
  await db.$disconnect();
  db = await openDatabase(dir, migrations);
  store = new MoniStore(db);
  const saved = await store.history("@EXAMPLE");
  expect(saved).toHaveLength(100);
  expect(saved[0].score).toBe(2);
  expect(saved.at(-1)?.score).toBe(101);
  expect(await store.history("other")).toEqual([]);
  await db.liveCache.update({
    where: { key: "moni-history:example" },
    data: { updatedAt: new Date("2020-01-01") },
  });
  await new DatabaseCache(db).put("test-transient-cache", {} as Snapshot);
  expect(await store.history("example")).toHaveLength(100);
  await db.liveCache.deleteMany();
  expect(await store.history("example")).toEqual([]);
});
