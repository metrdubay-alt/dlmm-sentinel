import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { GMGN_READ_SCRIPT } from "../../main/services/gmgn-dom";
import { parseGmgnCard } from "../../shared/analysis/gmgn";
test("Russian GMGN reads labels, unlabelled capitalization and separates holder growth", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-gmgn-ru-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );
  env.SENTINEL_DATA_DIR = dir;
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.SENTINEL_PACKAGED_EXE;
  const app = await electron.launch({
    args: executablePath ? [] : ["."],
    executablePath,
    env,
  });
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole("button", { name: "Карточка токена", exact: true }),
    ).toBeVisible();
    const target = {
      chain: "robinhood" as const,
      address: "0xfd1a35778d9798f13c6fb97d29c07a5ce3f7fb5e",
    };
    const raw = await app.evaluate(
      async ({ BrowserWindow, session }, { target, script }) => {
        const isolated = session.fromPartition("gmgn-ru-test");
        isolated.protocol.handle(
          "https",
          () =>
            new Response(
              `<div id="GlobalScrollDomId">
 <a href="https://robin.etherscan.io/token/${target.address}">Token</a>
 <div data-sentry-component="BaseInfoBar"><div data-sentry-component="InfoItem"><div class="info-item-value">$800.10K</div></div></div>
 <div data-sentry-component="InfoItem"><span class="info-item-title">Топ 10</span><span class="info-item-value">14.58%</span></div>
 <div data-sentry-component="InfoItem"><span class="info-item-title">Holders</span><span class="info-item-value"><span>1K</span> <span>6%</span></span></div>
 <div data-sentry-component="PoolItem"><span>Холдеры</span><span>1420</span></div>
 <div><div><span class="item-title">Фишинг</span></div><div class="item-value">24.5%</div></div>
 <div class="bg-card-100"><span>5m</span></div><div><span>Объём</span><span>$371.3K</span></div>
 </div>`,
              { headers: { "content-type": "text/html; charset=utf-8" } },
            ),
        );
        const w = new BrowserWindow({
          show: false,
          webPreferences: { session: isolated },
        });
        try {
          await w.loadURL(`https://gmgn.ai/robinhood/token/${target.address}`);
          return await w.webContents.executeJavaScript(script);
        } finally {
          w.destroy();
        }
      },
      { target, script: GMGN_READ_SCRIPT },
    );
    const s = parseGmgnCard(raw, target, new Date().toISOString());
    expect(s.metrics.top10Pct.value).toBe(14.58);
    expect(s.metrics.holderCount.value).toBe(1420);
    expect(s.metrics.marketCapUsd.value).toBe(800100);
    expect(s.metrics.phishingPct.value).toBe(24.5);
    expect(s.metrics.volume5mUsd.value).toBe(371300);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
