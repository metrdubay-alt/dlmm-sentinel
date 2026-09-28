import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("profiles persist thresholds, colour flags, selection and token age", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-profiles-"));
  const env: Record<string, string> = Object.fromEntries(
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
  const target = {
    chain: "bsc" as const,
    address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
  };
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ session, dialog }, t) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      session
        .fromPartition("persist:sentinel-gmgn")
        .protocol.handle(
          "https",
          () =>
            new Response(
              `<div id="GlobalScrollDomId"><a href="https://bscscan.com/token/${t.address}">Token</a><span>Vol</span><span>$85000</span><div class="bg-card-100"><span>5m</span></div><div data-sentry-component="InfoItem"><span class="info-item-title">Top 10</span><span class="info-item-value">12%</span></div><div data-sentry-component="PoolItem"><span>Market cap</span><span>$2000000</span></div><div data-sentry-component="PoolItem"><span>Token created</span><span>2026-01-01T00:00:00Z</span></div></div>`,
              { headers: { "content-type": "text/html" } },
            ),
        );
    }, target);
    await page.evaluate(
      (t) =>
        window.sentinel.workspaceSave({
          target: t,
          label: "ДЕМО ПРОФИЛИ",
          handle: null,
          monitor: false,
          intervalMinutes: 15,
        }),
      target,
    );
    await page.getByLabel("Режим данных").selectOption("live");
    await expect(page.getByLabel("Режим данных")).toBeEnabled();
    await page.evaluate(
      (target) =>
        window.sentinel.workspaceRefresh({
          target,
          navigate: true,
          scope: "numeric",
        }),
      target,
    );
    const open = async () => {
      await page.getByRole("button", { name: "Архив", exact: true }).click();
      await page
        .getByRole("row")
        .filter({ hasText: "ДЕМО ПРОФИЛИ" })
        .getByRole("button", { name: "Открыть карточку", exact: true })
        .click();
    };
    await open();
    const top = page
      .getByRole("row")
      .filter({ hasText: "Top 10, %" })
      .locator(".metric-value");
    await expect(top).toHaveAttribute("data-tone", "neutral");
    await expect(
      page.getByRole("row").filter({ hasText: "Возраст токена" }),
    ).toContainText(/д\./);
    await expect(page.getByText(/Total Fees исходно/)).toHaveCount(0);
    await expect(
      page.getByLabel("Профиль оценки").locator("option:checked"),
    ).toContainText("Слоукуки");
    const volume = page
      .getByRole("row")
      .filter({ hasText: "Суммарный объём за 5 минут" })
      .locator(".metric-value");
    await page.getByLabel("Профиль оценки").selectOption("runner");
    await expect(volume).toHaveAttribute("data-tone", "neutral");
    await page.getByLabel("Профиль оценки").selectOption("slowcook");
    await expect(volume).toHaveAttribute("data-tone", "good");
    await page.getByRole("button", { name: "Профили", exact: true }).click();
    await expect(page.locator(".profile-rules tbody tr").first()).toContainText(
      "Age · Возраст токена",
    );
    await page
      .getByRole("button", { name: "+ Новый профиль", exact: true })
      .click();
    await page
      .getByLabel("Название профиля", { exact: true })
      .fill("Осторожный");
    await page.getByLabel("Top 10, %: green", { exact: true }).fill("5");
    await page.getByLabel("Top 10, %: red", { exact: true }).fill("8");
    await page.getByLabel("Top 10, %: flag", { exact: true }).fill("10");
    await page
      .getByRole("button", { name: "Сохранить профили", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Профили сохранены");
    await page.screenshot({
      path: "test-results/profiles-editor.png",
      fullPage: true,
    });
    const profiles = (
      await page.evaluate(() => window.sentinel.settings(undefined))
    ).numericProfiles;
    const custom = profiles.find((p) => p.name === "Осторожный")!;
    expect(profiles).toHaveLength(3);
    await open();
    await page.getByLabel("Профиль оценки").selectOption(custom.id);
    await expect(top).toHaveAttribute("data-tone", "bad");
    await expect(
      page.getByRole("row").filter({ hasText: "Top 10, %" }).getByRole("img"),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/profiles-card.png",
      fullPage: true,
    });
    await page.reload();
    await open();
    await expect(page.getByLabel("Профиль оценки")).toHaveValue(custom.id);
    await expect(top).toHaveAttribute("data-tone", "bad");
    await page.getByLabel("Профиль оценки").selectOption("auto");
    await expect(top).toHaveAttribute("data-tone", "neutral");
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
