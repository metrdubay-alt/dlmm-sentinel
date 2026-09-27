import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../../main/services/database";
import { WorkspaceStore } from "../../main/services/workspace-store";
test("two views, compact card, three analysis zones and archived analyzed tokens", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-simple-"));
  const target = {
    chain: "bsc" as const,
    address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
  };
  const db = await openDatabase(dir, path.resolve("prisma/migrations"));
  const store = new WorkspaceStore(db);
  const config = {
    target,
    label: "ДЕМО ТОКЕН",
    handle: "example",
    monitor: false,
    intervalMinutes: 15 as const,
  };
  await store.save(config);
  const key = `workspace:bsc:${target.address}`;
  const row = await db.liveCache.findUniqueOrThrow({ where: { key } });
  await db.liveCache.update({
    where: { key },
    data: {
      snapshotJson: JSON.stringify({
        ...JSON.parse(row.snapshotJson),
        lastAttempt: "2026-09-26T00:00:00Z",
      }),
    },
  });
  await store.save({
    ...config,
    label: "НЕ ПРОВЕРЕН",
    target: {
      ...target,
      address: "0x1111111111111111111111111111111111111111",
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
    await expect(page.locator("nav button")).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: "Карточка токена", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Адрес карточки")).toHaveValue("");
    await page.getByRole("button", { name: "Архив", exact: true }).click();
    await expect(page.getByText("НЕ ПРОВЕРЕН", { exact: true })).toHaveCount(0);
    await page
      .getByRole("row")
      .filter({ hasText: "ДЕМО ТОКЕН" })
      .getByRole("button", { name: "Открыть карточку", exact: true })
      .click();
    await expect(page.locator(".token-header h1")).toContainText("ДЕМО ТОКЕН");
    await expect(page.locator(".token-address")).toHaveText(target.address);
    await expect(page.getByLabel("Адрес карточки")).toHaveCount(0);
    await expect(page.locator("main h2")).toHaveText([
      "1. Числовой анализ",
      "2. Оценка Twitter · Grok",
      "3. Объёмы и эффективность пулов",
    ]);
    await expect(
      page.getByText("Потенциальное давление продаж", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Изменения и уведомления", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Открыть Grok", exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: "test-results/simple-card-0313.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Новый токен", exact: true })
      .click();
    await expect(page.getByLabel("Адрес карточки")).toHaveValue("");
    await expect(page.getByLabel("Тикер карточки")).toHaveCount(0);
    await expect(page.getByLabel("Профиль X карточки")).toHaveCount(0);
    await expect(page.locator("main h2")).toHaveCount(0);
    await page
      .getByLabel("Адрес карточки")
      .fill("F9PvspnWkP3hSLaYxQb2LvFRBgyrLVhdUJ5q39tZZPbC");
    await page
      .getByRole("button", { name: "Сохранить карточку", exact: true })
      .click();
    await expect(page.locator(".token-header h1")).toContainText("Токен");
    await expect(page.locator(".token-address")).not.toHaveText(target.address);
    await page.getByRole("button", { name: "Изменить", exact: true }).click();
    await expect(page.getByLabel("Тикер карточки")).toHaveValue("");
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
