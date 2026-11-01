import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { holderPressure } from "../../shared/analysis/gmgn";
test("BSC fixture: SVG fee asset, conversion, pool exclusion and independent history", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-bsc-e2e-"));
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
  const address = "0xcafdbce93477261db8250e42bdae6e66733f9e20";
  const pool = "0x7a907a283ef913eb25bee3afd110f687a3fb7eed";
  try {
    await app.evaluate(
      ({ session, dialog }, { address, pool }) => {
        dialog.showMessageBox = async () => ({
          response: 1,
          checkboxChecked: false,
        });
        globalThis.fetch = async () =>
          new Response(
            JSON.stringify({
              solana: {
                usd: 120,
                last_updated_at: Math.floor(Date.now() / 1000),
              },
              binancecoin: {
                usd: 600,
                last_updated_at: Math.floor(Date.now() / 1000),
              },
            }),
            { headers: { "content-type": "application/json" } },
          );
        session.fromPartition("persist:sentinel-gmgn").protocol.handle(
          "https",
          () =>
            new Response(
              `<!doctype html><h1>ДЕМО-ДАННЫЕ — fixture BSC</h1><div id="GlobalScrollDomId">
   <a href="https://bscscan.com/token/${address}">Token</a>
   <div data-sentry-component="InfoItem"><span class="info-item-title">Total Fees</span><span class="info-item-value"><svg data-icon="IconBscbal12px"></svg>30</span></div>
   <div data-sentry-component="PoolInfo"><a href="https://bscscan.com/address/${pool}">Pool</a></div>
   <div id="test-panel-holders"><div><div data-testid="table-cell-holder"><a href="/bsc/address/${pool}">Pool</a><span data-testid="user-tag-bundler"></span></div><div data-testid="table-cell-unrealized">+$20,000<br>+1200%</div><div data-testid="table-cell-owned">$100,000<br>10%</div></div></div>
   </div>`,
              { headers: { "content-type": "text/html" } },
            ),
        );
      },
      { address, pool },
    );
    const page = await app.firstWindow();
    await page.evaluate(async () =>
      window.sentinel.saveSettings({
        ...(await window.sentinel.settings(undefined)),
        demoMode: false,
      }),
    );
    await page.evaluate(
      (address) => window.sentinel.gmgnOpen({ chain: "bsc", address }),
      address,
    );
    await page.evaluate(
      (address) => window.sentinel.gmgnCapture({ chain: "bsc", address }),
      address,
    );
    await page.evaluate(async () =>
      window.sentinel.saveSettings({
        ...(await window.sentinel.settings(undefined)),
        demoMode: true,
      }),
    );
    await page.reload();
    await page.getByLabel("Сеть карточки").selectOption("bsc");
    await page.getByLabel("Адрес карточки").fill(address);
    await page
      .getByRole("button", { name: "Сохранить карточку", exact: true })
      .click();
    const rows = await page.evaluate(
      (address) => window.sentinel.gmgnHistory({ chain: "bsc", address }),
      address,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].nativeFees?.asset).toBe("BNB");
    expect(rows[0].metrics.totalFeesSolEquivalent.value).toBe(150);
    expect(rows[0].poolAddresses).toEqual([pool]);
    expect(rows[0].holders?.rows).toHaveLength(1);
    expect(rows[0].feeConversion).toMatchObject({
      source: "CoinGecko",
      nativeUsd: 600,
      solUsd: 120,
    });
    expect(holderPressure(rows[0]).byPosition).toEqual([]);
    await expect(page.getByText("150", { exact: true }).first()).toBeVisible();
    await page
      .getByRole("button", { name: "Новый токен", exact: true })
      .click();
    await page.getByLabel("Сеть карточки").selectOption("sol");
    await expect(page.getByText("150", { exact: true })).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        window.sentinel.gmgnHistory({
          chain: "sol",
          address: "F9PvspnWkP3hSLaYxQb2LvFRBgyrLVhdUJ5q39tZZPbC",
        }),
      ),
    ).toEqual([]);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
