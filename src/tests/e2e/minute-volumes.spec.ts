import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("ten completed SOL minute volumes persist and follow the selected profile", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-minute-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  env.SENTINEL_DATA_DIR = dir;
  const executablePath = process.env.SENTINEL_PACKAGED_EXE;
  const app = await electron.launch({
    executablePath,
    args: executablePath ? [] : ["."],
    env,
  });
  try {
    const target = {
      chain: "sol" as const,
      address: "7VertkgF9KLhxxJXHX6uaWuoYZTP9LdGj2bWmVXVpump",
    };
    await app.evaluate(({ session, dialog }, target) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      session
        .fromPartition("persist:sentinel-gmgn")
        .protocol.handle("https", (request) => {
          if (
            new URL(request.url).pathname.startsWith(
              "/api/v1/token_mcap_candles/",
            )
          ) {
            const end = Math.floor(Date.now() / 60000) * 60000;
            return Response.json({
              code: 0,
              data: {
                list: [
                  19900, 20000, 30000, 30100, 45000, 40000, 40000, 40000, 40000,
                  40000, 900000,
                ].map((volume, i) => ({
                  time: end - 600000 + i * 60000,
                  volume: String(volume),
                })),
                _debug_tpool: {
                  base_address: target.address,
                  pool_address: target.address,
                },
              },
            });
          }
          return new Response(
            `<div id="GlobalScrollDomId"><a href="https://solscan.io/token/${target.address}">Token</a></div>`,
            { headers: { "content-type": "text/html" } },
          );
        });
      globalThis.fetch = async (input) => {
        if (
          String(input) ===
          "https://api.exchange.coinbase.com/products/SOL-USD/ticker"
        )
          return Response.json({
            price: "100",
            time: new Date().toISOString(),
          });
        throw Error("Unexpected request");
      };
    }, target);
    const page = await app.firstWindow();
    await expect(
      page.getByRole("button", { name: "Архив", exact: true }),
    ).toBeVisible();
    await page.evaluate(
      (target) =>
        window.sentinel.workspaceSave({
          target,
          label: "MINUTE V",
          handle: null,
          relatedAccounts: [],
          monitor: false,
          intervalMinutes: 15,
          numericProfileId: "runner",
        }),
      target,
    );
    const report = await page.evaluate(
      (target) =>
        window.sentinel.workspaceRefresh({
          target,
          navigate: true,
          scope: "numeric",
        }),
      target,
    );
    expect(report.gmgn?.minuteVolumes?.candles.map((c) => c.volumeSol)).toEqual(
      [199, 200, 300, 301, 450, 400, 400, 400, 400, 400],
    );
    await page.reload();
    await page.getByRole("button", { name: "Архив", exact: true }).click();
    await page
      .getByRole("row")
      .filter({ hasText: "MINUTE V" })
      .getByRole("button", { name: "Открыть карточку", exact: true })
      .click();
    const block = page.getByLabel("V, SOL/min за последние 10 минут", {
      exact: true,
    });
    await expect(block).toBeVisible();
    await expect(block).toContainText("Снимок");
    await expect(block.getByRole("listitem")).toHaveCount(10);
    expect(
      await block
        .getByRole("listitem")
        .evaluateAll((items) => items.map((e) => e.getAttribute("data-tone"))),
    ).toEqual([
      "bad",
      "neutral",
      "neutral",
      "good",
      "good",
      "good",
      "good",
      "good",
      "good",
      "good",
    ]);
    await expect(block).toContainText("условие не выполнено");
    await expect(block).not.toContainText("Минимальный объём");
    await expect(block).not.toContainText("Пересчёт");
    await block.screenshot({ path: "test-results/minute-volumes.png" });
    await page
      .getByLabel("Профиль оценки", { exact: true })
      .selectOption("slowcook");
    await expect(block.getByRole("listitem").first()).toHaveAttribute(
      "data-tone",
      "neutral",
    );
    await expect(block).not.toContainText("условие не выполнено");
    await page
      .getByLabel("Профиль оценки", { exact: true })
      .selectOption("runner");
    await expect(block.getByRole("listitem").first()).toHaveAttribute(
      "data-tone",
      "bad",
    );
    await page
      .getByRole("button", { name: "Настроить профили", exact: true })
      .click();
    const label = "V каждой из 10 минутных свечей, SOL · только Solana";
    await expect(page.getByLabel(label + ": red", { exact: true })).toHaveValue(
      "200",
    );
    await page.getByLabel(label + ": red", { exact: true }).fill("250");
    await page
      .getByRole("button", { name: "Сохранить профили", exact: true })
      .click();
    await expect(
      page.getByText("Профили сохранены. Цвета и флаги в карточках обновлены."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Архив", exact: true }).click();
    await page
      .getByRole("row")
      .filter({ hasText: "MINUTE V" })
      .getByRole("button", { name: "Открыть карточку", exact: true })
      .click();
    await expect(block.getByRole("listitem").nth(1)).toHaveAttribute(
      "data-tone",
      "bad",
    );
    await page.reload();
    const history = await page.evaluate(
      (t) => window.sentinel.gmgnHistory(t),
      target,
    );
    expect(history.at(-1)?.minuteVolumes?.candles).toHaveLength(10);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
