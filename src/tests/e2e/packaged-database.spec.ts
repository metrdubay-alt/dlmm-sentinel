import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("packaged app loads its own Prisma engine with fresh database and unrelated Cyrillic cwd", async () => {
  const executablePath = process.env.SENTINEL_PACKAGED_EXE;
  test.skip(!executablePath, "Requires packaged Windows executable");
  const dir = await mkdtemp(
    path.join(tmpdir(), "Sentinel-Александр-чистый запуск-"),
  );
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] =>
        e[1] !== undefined &&
        !e[0].startsWith("PRISMA_") &&
        e[0] !== "ELECTRON_RUN_AS_NODE",
    ),
  );
  env.SENTINEL_DATA_DIR = dir;
  const app = await electron.launch({
    executablePath,
    args: [],
    cwd: dir,
    env,
  });
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole("button", { name: "Карточка токена", exact: true }),
    ).toBeVisible();
    expect(
      (await page.evaluate(() => window.sentinel.settings(undefined))).demoMode,
    ).toBe(false);
    await expect(page.getByLabel("Режим данных")).toBeHidden();
    await page.getByText("Настройки режима", { exact: true }).click();
    await expect(page.getByLabel("Режим данных")).toHaveValue("live");
    await page.screenshot({ path: "test-results/live-default-settings.png" });
    const details = await app.evaluate(() => ({
      resources: process.resourcesPath,
      engines: (
        process.report.getReport() as unknown as { sharedObjects: string[] }
      ).sharedObjects.filter((p) => /query_engine.*\.node$/i.test(p)),
    }));
    expect(details.engines.length, JSON.stringify(details)).toBeGreaterThan(0);
    for (const engine of details.engines) {
      const physical = engine.startsWith("\\\\?\\") ? engine.slice(4) : engine;
      const relative = path.relative(details.resources, physical);
      expect(
        relative.startsWith("..") || path.isAbsolute(relative),
        JSON.stringify(details),
      ).toBe(false);
    }
    await page.evaluate(() =>
      window.sentinel.workspaceSave({
        target: {
          chain: "sol",
          address: "So11111111111111111111111111111111111111112",
        },
        label: "ДЕМО ЧИСТАЯ УСТАНОВКА",
        handle: null,
        monitor: false,
        intervalMinutes: 15,
      }),
    );
    expect(
      (
        await page.evaluate(() => window.sentinel.workspaceList(undefined))
      ).some((c) => c.config.label === "ДЕМО ЧИСТАЯ УСТАНОВКА"),
    ).toBe(true);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
