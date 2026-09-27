import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("Robinhood numeric card, delete confirmation, and source sessions survive restart", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-persist-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  env.SENTINEL_DATA_DIR = dir;
  const executablePath = process.env.SENTINEL_PACKAGED_EXE;
  const launch = () =>
    electron.launch({ args: executablePath ? [] : ["."], executablePath, env });
  let app = await launch();
  const target = {
    chain: "robinhood" as const,
    address: "0x7dbf38976f6d3b9c529e7d9484a71898b409ee6a",
  };
  const fixtures = async () =>
    app.evaluate(({ session, dialog }, target) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      for (const [partition, html] of [
        [
          "persist:sentinel-gmgn",
          `<main id="GlobalScrollDomId"><a href="https://robin.etherscan.io/token/${target.address}#code">Token</a><div data-sentry-component="InfoItem"><span class="info-item-title">Top 10</span><span class="info-item-value">19.05%</span></div><div data-sentry-component="InfoItem"><span class="info-item-title">Total Fees</span><span class="info-item-value"><i data-icon="IconRobinhoodeth16pxS"></i>126.11</span></div><div data-sentry-component="FilterGroup"><div class="bg-card-100" onclick="period('5m')"><span>5m</span></div><div onclick="period('1h')"><span>1h</span></div><div><span>24h</span></div></div><span>Vol</span><b id="vol">$350</b></main><script>function period(p){for(const e of document.querySelector('[data-sentry-component="FilterGroup"]').children)e.className=e.textContent===p?'bg-card-100':'';document.querySelector('#vol').textContent=p==='1h'?'$48,000':'$350'}</script>`,
        ],
        ["persist:sentinel-moni", "<main>ДЕМО-ДАННЫЕ: session fixture</main>"],
      ])
        session
          .fromPartition(partition)
          .protocol.handle(
            "https",
            () =>
              new Response(html, { headers: { "content-type": "text/html" } }),
          );
      globalThis.fetch = async () =>
        Response.json({
          solana: { usd: 100, last_updated_at: Math.floor(Date.now() / 1000) },
          ethereum: {
            usd: 2000,
            last_updated_at: Math.floor(Date.now() / 1000),
          },
        });
    }, target);
  try {
    await fixtures();
    let page = await app.firstWindow();
    await page.getByLabel("Режим данных").selectOption("live");
    await expect(page.getByLabel("Режим данных")).toBeEnabled();
    const report = await page.evaluate(async (target) => {
      await window.sentinel.workspaceSave({
        target,
        label: "ZZZ fixture",
        handle: null,
        monitor: false,
        intervalMinutes: 15,
      });
      return window.sentinel.workspaceRefresh({ target, navigate: true });
    }, target);
    expect(report.gmgn?.metrics.top10Pct.value).toBe(19.05);
    expect(report.gmgn?.nativeFees?.asset).toBe("ETH");
    expect(report.gmgn?.metrics.volume5mUsd.value).toBe(350);
    expect(report.gmgn?.metrics.volume1hUsd.value).toBe(48000);
    expect(report.gmgn?.metrics.totalFeesSolEquivalent.value).toBeCloseTo(
      2522.2,
    );
    await page.getByRole("button", { name: "Архив", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Удалить карточку ZZZ fixture" }),
    ).toBeVisible();
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 0,
        checkboxChecked: false,
      });
    });
    await page
      .getByRole("button", { name: "Удалить карточку ZZZ fixture" })
      .click();
    await expect(
      page.getByRole("button", { name: "Удалить карточку ZZZ fixture" }),
    ).toBeEnabled();
    expect(
      await page.evaluate(() => window.sentinel.workspaceList(undefined)),
    ).toHaveLength(1);
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    });
    await page
      .getByRole("button", { name: "Удалить карточку ZZZ fixture" })
      .click();
    await expect(
      page.getByRole("button", { name: "Удалить карточку ZZZ fixture" }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => window.sentinel.workspaceList(undefined)),
    ).toHaveLength(0);
    for (const source of ["gmgn", "moni"] as const)
      await page.evaluate((s) => window.sentinel.sourceLogin(s), source);
    await app.evaluate(async ({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows().filter((w) =>
        /^https:\/\/(gmgn.ai|app.moni.ai)/.test(w.webContents.getURL()),
      )) {
        await w.webContents.executeJavaScript(
          'localStorage.setItem("sentinel-fixture-login","retained")',
        );
        const s = w.webContents.session;
        await s.cookies.set({
          url: new URL(w.webContents.getURL()).origin,
          name: "sentinel-fixture",
          value: "not-a-real-credential",
          expirationDate: Date.now() / 1000 + 3600,
        });
        await s.cookies.flushStore();
        s.flushStorageData();
      }
    });
    await app.close();
    app = await launch();
    await fixtures();
    page = await app.firstWindow();
    for (const source of ["gmgn", "moni"] as const)
      await page.evaluate((s) => window.sentinel.sourceLogin(s), source);
    const saved = await app.evaluate(async ({ BrowserWindow }) =>
      Promise.all(
        BrowserWindow.getAllWindows()
          .filter((w) =>
            /^https:\/\/(gmgn.ai|app.moni.ai)/.test(w.webContents.getURL()),
          )
          .map(async (w) => ({
            local: await w.webContents.executeJavaScript(
              'localStorage.getItem("sentinel-fixture-login")',
            ),
            cookie: (
              await w.webContents.session.cookies.get({
                name: "sentinel-fixture",
              })
            ).length,
          })),
      ),
    );
    expect(saved).toHaveLength(2);
    expect(saved.every((x) => x.local === "retained" && x.cookie === 1)).toBe(
      true,
    );
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
