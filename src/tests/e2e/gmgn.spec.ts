import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("GMGN fixture: precise top10, numeric report, history, isolated window and demo gate", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-gmgn-e2e-"));
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
  const address = "F9PvspnWkP3hSLaYxQb2LvFRBgyrLVhdUJ5q39tZZPbC";
  try {
    await app.evaluate(({ dialog, session }, address) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      session.fromPartition("persist:sentinel-gmgn").protocol.handle(
        "https",
        () =>
          new Response(
            `<!doctype html><html><body><h1>ДЕМО-ДАННЫЕ — локальная fixture</h1><div id="GlobalScrollDomId">
   <a href="https://solscan.io/token/${address}">Token</a>
   <div data-sentry-component="BaseInfoBar"><div><svg data-icon="IconDisplay16pxRegular" width="15" height="15"></svg><div>13</div></div></div>
   <div><svg data-icon="IconDisplay16pxRegular" width="15" height="15"></svg><div>999</div></div>
   <div data-sentry-component="InfoItem"><span class="info-item-title">Top 10</span><span class="info-item-value" id="top">21.52%</span></div>
   <div data-sentry-component="InfoItem"><span class="info-item-title">Holders</span><span class="info-item-value">1,211</span></div>
   <div data-sentry-component="InfoItem"><span class="info-item-title">Total Fees</span><span class="info-item-value"><img data-icon="IconSolanabal14pxS">32.35</span></div>
   <div><div><span class="item-title">Bundler</span></div><div class="item-value">20%</div></div>
   <div><div><span class="item-title">Phishing</span></div><div class="item-value">2.5%</div></div>
   <div data-sentry-component="PoolItem"><div>Top 10</div><div>22%</div></div>
   <div data-sentry-component="PoolItem"><div>Market cap</div><div>$400.01K</div></div>
   <div data-sentry-component="PoolItem"><div>Total liq</div><div>$50K(100 BP)</div></div>
   <div class="bg-card-100"><span>5m</span><span>+1%</span></div>
   <div><span>Vol</span><span>$100,001</span></div>
   <div id="test-panel-holders"><div>
    <div data-testid="table-cell-holder"><a href="/sol/address/HRo7TZ1gDNhjTfoubRmFpyfZreGxqC1Sjet6w8TkD3R4">HRo7...D3R4</a><span data-testid="user-tag-bundler"></span></div>
    <div data-testid="table-cell-unrealized">+$12,000<br>+1200.25%</div>
    <div data-testid="table-cell-pnl">+$99,000<br>+9900%</div>
    <div data-testid="table-cell-owned">$15,000<br>1.5%</div>
    <div data-testid="table-cell-source"><a href="/sol/address/${address}">Funding</a></div>
   </div></div>
   </div><div role="tooltip">Bundlers hold 19.97% ATH hold 19.97%</div><div role="tooltip" style="display:none">Bundlers hold 60% ATH hold 60%</div></body></html>`,
            { headers: { "content-type": "text/html" } },
          ),
      );
    }, address);
    const page = await app.firstWindow();
    await page
      .getByRole("button", { name: "Числовой анализ GMGN", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Открыть GMGN", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await page.getByLabel("Режим данных").selectOption("live");
    await page
      .getByRole("button", { name: "Сохранить настройки", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Числовой анализ GMGN", exact: true })
      .click();
    await page.getByLabel("Адрес токена GMGN").fill(address);
    const opened = app.waitForEvent("window");
    await page
      .getByRole("button", { name: "Открыть GMGN", exact: true })
      .click();
    const remote = await opened;
    await remote.waitForLoadState("domcontentloaded");
    expect(await remote.evaluate(() => typeof window.sentinel)).toBe(
      "undefined",
    );
    await page
      .getByRole("button", { name: "Прочитать и оценить", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "ПРОВЕРКА НЕ ЗАВЕРШЕНА", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("21.52%", { exact: true }).first(),
    ).toBeVisible();
    let rows = await page.evaluate(
      (address) => window.sentinel.gmgnHistory({ chain: "sol", address }),
      address,
    );
    expect(rows[0].metrics.bundlersPct.value).toBe(19.97);
    expect(rows[0].metrics.volume5mUsd.value).toBe(100001);
    expect(rows[0].watchers?.value).toBe(13);
    await expect(
      page.getByText(
        "Красный флаг: менее 100 наблюдателей GMGN (−10 баллов, не вето)",
        { exact: true },
      ),
    ).toBeVisible();
    expect(rows[0].displayedPoolLiquidity?.value).toBe(50000);
    expect(rows[0].holders?.rows).toHaveLength(1);
    expect(rows[0].holders?.rows[0].address).toBe(
      "HRo7TZ1gDNhjTfoubRmFpyfZreGxqC1Sjet6w8TkD3R4",
    );
    expect(rows[0].holders?.rows[0].unrealizedRoiPct).toBe(1200.25);
    await expect(
      page.getByRole("heading", {
        name: "Потенциальное давление продаж",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("1200.25%", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("≈ 30.0%", { exact: true }).first(),
    ).toBeVisible();
    await page
      .getByRole("heading", {
        name: "Потенциальное давление продаж",
        exact: true,
      })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/holder-pressure.png" });
    await remote.locator("#top").evaluate((e) => {
      e.textContent = "23.08%";
    });
    await page
      .getByRole("button", { name: "Прочитать и оценить", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "ВЕТО · не проходит правила входа",
        exact: true,
      }),
    ).toBeVisible();
    rows = await page.evaluate(
      (address) => window.sentinel.gmgnHistory({ chain: "sol", address }),
      address,
    );
    expect(rows).toHaveLength(2);
    await page.screenshot({ path: "test-results/gmgn-numeric.png" });
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await page.getByLabel("Режим данных").selectOption("mock");
    await page
      .getByRole("button", { name: "Сохранить настройки", exact: true })
      .click();
    await expect.poll(() => remote.isClosed()).toBe(true);
    await page
      .getByRole("button", { name: "Удалить локальные данные", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          (address) => window.sentinel.gmgnHistory({ chain: "sol", address }),
          address,
        ),
      )
      .toEqual([]);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
