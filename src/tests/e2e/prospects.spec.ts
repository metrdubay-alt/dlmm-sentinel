import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../../main/services/database";
import { AnalysisService } from "../../main/services/analysis-service";
import { demoMint } from "../../shared/providers/mock/fixtures";

test("ручное исследование X сохраняется через интерфейс и перезапуск", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-prospects-e2e-"));
  const db = await openDatabase(dir, path.resolve("prisma/migrations"));
  await new AnalysisService(db).scan({
    mint: demoMint,
    scenario: "insufficient",
    mode: "quick",
  });
  await db.$disconnect();
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );
  env.SENTINEL_DATA_DIR = dir;
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.SENTINEL_PACKAGED_EXE;
  const launch = () =>
    electron.launch({ args: executablePath ? [] : ["."], executablePath, env });
  let app = await launch();
  try {
    expect(await app.evaluate(({ app }) => app.getPath("userData"))).toBe(dir);
    let page = await app.firstWindow();
    await page
      .getByRole("button", { name: "Открыть отчёт", exact: true })
      .click();
    await page
      .getByRole("tab", { name: "Перспективность X", exact: true })
      .click();
    await page
      .getByLabel("Описание проекта и хронология")
      .fill("ДЕМО-ДАННЫЕ: мем без подтверждённой экономики");
    await page
      .getByText(
        "Подлинность · Связь mint, профиля и сайта (5 баллов) — Нет данных",
        { exact: true },
      )
      .click();
    await page
      .getByLabel("Оценка: Связь mint, профиля и сайта")
      .selectOption("50");
    await page
      .getByLabel("Обоснование", { exact: true })
      .fill("ДЕМО-ДАННЫЕ: совпадение mint без независимой верификации");
    await page
      .getByLabel("Источник HTTPS", { exact: true })
      .fill("https://x.com/demo_profile/status/1");
    await page.getByRole("button", { name: "Рассчитать и сохранить" }).click();
    await expect(
      page.getByRole("heading", { name: "2. Балльная оценка: N/A" }),
    ).toBeVisible();
    await expect(page.getByText(/изучено 5\/100/)).toBeVisible();
    await expect(page.getByText(/Возможный диапазон: 2,5–97,5/)).toBeVisible();
    await page.screenshot({
      path: "test-results/prospects-demo.png",
      fullPage: true,
    });
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page
      .getByRole("button", { name: "Открыть отчёт", exact: true })
      .click();
    await page
      .getByRole("tab", { name: "Перспективность X", exact: true })
      .click();
    await expect(
      page.getByText("ДЕМО-ДАННЫЕ: мем без подтверждённой экономики", {
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
