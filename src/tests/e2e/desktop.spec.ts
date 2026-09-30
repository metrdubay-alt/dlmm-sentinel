import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Scenario } from "../../shared/schemas/domain";
test("настоящее окно Electron: ввод, veto, evidence, настройки, перезапуск", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-e2e-"));
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    SENTINEL_DATA_DIR: dir,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.SENTINEL_PACKAGED_EXE;
  const launch = () =>
    electron.launch({ args: executablePath ? [] : ["."], executablePath, env });
  let app = await launch();
  try {
    expect(await app.evaluate(({ app }) => app.getPath("userData"))).toBe(dir);
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveTitle("DLMM Sentinel");
    expect(
      await page.evaluate(async () => {
        try {
          await fetch("https://example.com");
          return "allowed";
        } catch {
          return "blocked";
        }
      }),
    ).toBe("blocked");
    await page.getByText("Настройки режима", { exact: true }).click();
    await expect(page.getByLabel("Режим данных")).toHaveValue("live");
    await page.getByLabel("Режим данных").selectOption("mock");
    await expect(page.getByLabel("Режим данных")).toBeEnabled();
    expect(
      await page.evaluate(
        () => typeof (window as unknown as { require: unknown }).require,
      ),
    ).toBe("undefined");
    await page
      .getByRole("button", { name: "Новый токен", exact: true })
      .click();
    await expect(page.getByLabel("Адрес карточки")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Анализ токена", exact: true }),
    ).toHaveCount(0);
    await page.evaluate(() =>
      window.sentinel.scan({
        mint: "So11111111111111111111111111111111111111112",
        scenario: "mint-authority",
        mode: "quick",
        dataMode: "mock",
      }),
    );
    await page.reload();
    await page.getByRole("button", { name: "Архив", exact: true }).click();
    await expect(
      page.getByText("Демо: Активная mint authority", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Открыть отчёт", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "НЕ ВХОДИТЬ", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Veto и риски", exact: true }).click();
    const card = page.locator(".veto-card.triggered").first();
    await card
      .getByLabel("Примечание к ручной проверке")
      .fill("Демо проверено; запрет сохраняется.");
    await card
      .getByRole("button", { name: "Отметить как просмотренное" })
      .click();
    await expect(card).toContainText("Veto продолжает действовать.");
    await page.getByRole("tab", { name: "Источники", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Источники и воспроизводимость" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Архив", exact: true }).click();
    await page.screenshot({
      path: "test-results/desktop-dashboard.png",
      fullPage: true,
    });
    await app.close();
    app = await launch();
    const next = await app.firstWindow();
    await next.getByRole("button", { name: "Архив", exact: true }).click();
    await expect(
      next.getByRole("button", { name: "Открыть отчёт" }).first(),
    ).toBeVisible();
    await next.getByRole("button", { name: "Открыть отчёт" }).first().click();
    await expect(
      next.getByRole("heading", { name: "НЕ ВХОДИТЬ", exact: true }),
    ).toBeVisible();
    await next.screenshot({
      path: "test-results/desktop-report.png",
      fullPage: true,
    });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("все шесть fixtures доступны через настоящий IPC и русский UI", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-scenarios-"));
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (e): e is [string, string] => e[1] !== undefined,
      ),
    ),
    SENTINEL_DATA_DIR: dir,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.SENTINEL_PACKAGED_EXE;
  const app = await electron.launch({
    args: executablePath ? [] : ["."],
    executablePath,
    env,
  });
  try {
    expect(await app.evaluate(({ app }) => app.getPath("userData"))).toBe(dir);
    const page = await app.firstWindow();
    for (const [scenario, verdict] of [
      ["new-token", "ТОЛЬКО МИКРОРАЗМЕР"],
      ["concentration", "НЕ ВХОДИТЬ"],
      ["mint-authority", "НЕ ВХОДИТЬ"],
      ["drained", "НЕ ВХОДИТЬ"],
      ["social", "ТОЛЬКО МИКРОРАЗМЕР"],
      ["insufficient", "НУЖНА РУЧНАЯ ПРОВЕРКА"],
    ]) {
      await page.evaluate(
        (scenario) =>
          window.sentinel.scan({
            mint: "So11111111111111111111111111111111111111112",
            scenario: scenario as Scenario,
            mode: "quick",
            dataMode: "mock",
          }),
        scenario,
      );
      await page.reload();
      await page.getByRole("button", { name: "Архив", exact: true }).click();
      await page
        .getByRole("button", { name: "Открыть отчёт", exact: true })
        .first()
        .click();
      await expect(
        page.getByRole("heading", { name: verdict, exact: true }),
      ).toBeVisible();
    }
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
