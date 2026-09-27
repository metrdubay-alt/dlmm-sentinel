import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../../main/services/database";
import { WorkspaceStore } from "../../main/services/workspace-store";
import { poolSnapshotSchema } from "../../shared/analysis/pool-snapshot";
test("ДЕМО-ДАННЫЕ: pool table switches ranking windows and never fetches in demo", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-pool-e2e-"));
  const target = {
    chain: "bsc" as const,
    address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
  };
  const db = await openDatabase(dir, path.resolve("prisma/migrations"));
  await new WorkspaceStore(db).save({
    target,
    label: "ДЕМО-ДАННЫЕ",
    handle: null,
    monitor: false,
    intervalMinutes: 15,
  });
  const common = {
    dex: "fixture",
    tvlUsd: 100000,
    feePct: 1,
    feeSource: "field" as const,
    volume5mUsd: 100,
    volume1hUsd: 1000,
    sum5mUsd: 100,
    sum1hUsd: 1000,
    issue: "",
  };
  const data = poolSnapshotSchema.parse({
    target,
    observedAt: "2026-09-26T00:00:00Z",
    endEpochSeconds: 1790380800,
    source: "GeckoTerminal",
    discoveryComplete: true,
    rows: [
      ...Array.from({ length: 11 }, (_, i) => ({
        ...common,
        address: String(i + 3).padStart(40, "0"),
        name: i === 10 ? "ДЕМО LOW TVL" : `ДЕМО extra ${i}`,
        tvlUsd: i === 10 ? 1000 : 1000.01,
        efficiency5m: i === 10 ? 999 : 0,
        efficiency1h: i === 10 ? 999 : 0,
      })),
      {
        ...common,
        address: "11111111111111111111111111111111",
        name: "ДЕМО A",
        efficiency5m: 1,
        efficiency1h: 2,
      },
      {
        ...common,
        address: "22222222222222222222222222222222",
        name: "ДЕМО B",
        efficiency5m: 2,
        efficiency1h: 1,
      },
    ],
  });
  await db.liveCache.create({
    data: {
      key: `pool-snapshot:bsc:${target.address}`,
      snapshotJson: JSON.stringify(data),
    },
  });
  const key = `workspace:bsc:${target.address}`;
  const saved = await db.liveCache.findUniqueOrThrow({ where: { key } });
  await db.liveCache.update({
    where: { key },
    data: {
      snapshotJson: JSON.stringify({
        ...JSON.parse(saved.snapshotJson),
        lastAttempt: "2026-09-26T00:00:00Z",
      }),
    },
  });
  await db.$disconnect();
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  env.SENTINEL_DATA_DIR = dir;
  const executablePath = process.env.SENTINEL_PACKAGED_EXE;
  const app = await electron.launch({
    args: executablePath ? [] : ["."],
    executablePath,
    env,
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Архив", exact: true }).click();
    await page
      .getByRole("button", { name: "Открыть карточку", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Обновить пулы", exact: true }),
    ).toBeDisabled();
    const table = page
      .locator("section")
      .filter({
        has: page.getByRole("heading", {
          name: "3. Объёмы и эффективность пулов",
        }),
      })
      .locator("tbody tr");
    await expect(table).toHaveCount(10);
    await expect(
      page.getByRole("button", { name: "ДЕМО LOW TVL", exact: true }),
    ).toHaveCount(0);
    await expect(table.first()).toContainText("ДЕМО B");
    await expect(table.first().locator("td").nth(2)).toContainText("24ч: 576,0%");
    await expect(table.first().locator("td").nth(3)).toContainText("24ч: 24,0%");
    await expect(page.locator("th[aria-sort=descending]")).toContainText(
      "Fee/TVL 5м",
    );
    await expect(table.first()).toHaveCSS("--pool-strength", "1");
    await expect(table.nth(1)).toHaveCSS("--pool-strength", "0.5");
    await page
      .getByRole("heading", { name: "3. Объёмы и эффективность пулов" })
      .scrollIntoViewIfNeeded();
    await page
      .locator("section")
      .filter({
        has: page.getByRole("heading", {
          name: "3. Объёмы и эффективность пулов",
        }),
      })
      .screenshot({ path: "test-results/pool-gradient.png" });
    await page.getByLabel("Сортировка пулов").selectOption("1h");
    await expect(table.first()).toContainText("ДЕМО A");
    await expect(
      page.getByText(/Объём проверенных активных пулов/),
    ).toContainText(/1\s300/);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
