import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("live режим, отключённые источники, защищённый импорт и экспорт без секретов", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-live-e2e-"));
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
  const app = await electron.launch({
    args: executablePath ? [] : ["."],
    executablePath,
    env,
  });
  try {
    expect(await app.evaluate(({ app }) => app.getPath("userData"))).toBe(dir);
    const input = path.join(dir, "credentials-test.json"),
      output = path.join(dir, "export-test.json");
    const key = "TEST_ONLY_FAKE_CREDENTIAL_0123456789";
    await writeFile(
      input,
      JSON.stringify({
        rpcEndpoint: `https://mainnet.helius-rpc.com/?api-key=${key}`,
        rugcheckKey: key,
        xBearerToken: key,
        gmgnKey: key,
        bubblemapsKey: key,
      }),
    );
    await app.evaluate(
      ({ dialog }, files) => {
        dialog.showMessageBox = async () => ({
          response: 1,
          checkboxChecked: false,
        });
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [files.input],
        });
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: files.output,
        });
      },
      { input, output },
    );
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await page
      .getByRole("button", { name: "Импорт API-настроек", exact: true })
      .click();
    await expect(page.getByText(/RPC: личный endpoint/)).toBeVisible();
    await expect(page.getByText(/X: ключ сохранён/)).toBeVisible();
    expect(
      (await readFile(path.join(dir, "api-credentials.enc"))).includes(
        Buffer.from(key),
      ),
    ).toBe(false);
    expect(await page.locator("body").innerText()).not.toContain(key);
    await page.getByLabel("Режим данных").selectOption("live");
    for (const name of [
      "Solana RPC",
      "Крупнейшие token accounts",
      "DexScreener",
      "RugCheck",
      "Meteora DLMM",
      "X · поиск упоминаний mint",
      "GMGN · кошельки и метрики",
      "Bubblemaps · кластеры",
    ])
      await page.getByLabel(name, { exact: true }).uncheck();
    await page
      .getByRole("button", { name: "Сохранить настройки", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Настройки сохранены");
    await page
      .getByRole("button", { name: "Анализ токена", exact: true })
      .click();
    await expect(page.getByLabel("Демонстрационный сценарий")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Пример: Wrapped SOL", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Анализировать токен", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "НУЖНА РУЧНАЯ ПРОВЕРКА", exact: true }),
    ).toBeVisible();
    const report = (
      await page.evaluate(() => window.sentinel.reports(undefined))
    )[0];
    expect(report.sourceType).toBe("live");
    expect(
      report.snapshots.every(
        (s) => s.status === "unavailable" && s.sourceType === "live",
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Экспорт", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("экспортированы");
    expect(await readFile(output, "utf8")).not.toContain(key);
    await page.screenshot({
      path: "test-results/live-unavailable.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await page
      .getByRole("button", { name: "Удалить API-настройки", exact: true })
      .click();
    await expect(page.getByText(/RPC: публичный endpoint/)).toBeVisible();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("online smoke: реальный mint через production IPC", async () => {
  test.skip(
    process.env.SENTINEL_LIVE_SMOKE !== "1",
    "External network smoke is opt-in",
  );
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-online-e2e-"));
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
  const app = await electron.launch({
    args: executablePath ? [] : ["."],
    executablePath,
    env,
  });
  try {
    expect(await app.evaluate(({ app }) => app.getPath("userData"))).toBe(dir);
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    });
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await page.getByLabel("Режим данных").selectOption("live");
    await page
      .getByRole("button", { name: "Сохранить настройки", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Настройки сохранены");
    await page
      .getByRole("button", { name: "Анализ токена", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Пример: Wrapped SOL", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Анализировать токен", exact: true })
      .click();
    await expect(
      page.getByText("ОТЧЁТ · РЕАЛЬНЫЕ ИСТОЧНИКИ", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    const report = (
      await page.evaluate(() => window.sentinel.reports(undefined))
    )[0];
    expect(
      report.snapshots.some(
        (s) => s.sourceType === "live" && s.status === "partial" && s.data,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/live-report.png",
      fullPage: true,
    });
    await page.getByRole("tab", { name: "DLMM LP", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Пулы Meteora DLMM", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/live-meteora.png",
      fullPage: true,
    });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
