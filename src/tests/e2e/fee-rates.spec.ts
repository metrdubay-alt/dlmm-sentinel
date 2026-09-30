import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("packaged GMGN capture persists a Coinbase conversion when CoinGecko is blocked", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-fee-backup-"));
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
    await expect(page.getByLabel("Режим данных")).toBeVisible();
    const target = {
      chain: "robinhood" as const,
      address: "0xfd1a35778d9798f13c6fb97d29c07a5ce3f7fb5e",
    };
    await app.evaluate(({ session, dialog }, target) => {
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
              `<div id="GlobalScrollDomId"><a href="https://robin.etherscan.io/token/${target.address}">Token</a><div data-sentry-component="InfoItem"><span class="info-item-title">Total Fees</span><span class="info-item-value"><img data-icon="IconRobinhoodeth16pxS">2.75</span></div></div>`,
              { headers: { "content-type": "text/html; charset=utf-8" } },
            ),
        );
      globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.startsWith("https://api.coingecko.com/"))
          return new Response("", { status: 403 });
        if (
          url === "https://api.exchange.coinbase.com/products/SOL-USD/ticker" ||
          url === "https://api.exchange.coinbase.com/products/ETH-USD/ticker"
        )
          return Response.json({
            price: url.includes("SOL-USD") ? "100" : "2500",
            time: new Date().toISOString(),
          });
        throw new Error("Unexpected network request in fee fixture");
      };
    }, target);
    await page.getByLabel("Режим данных").selectOption("live");
    await expect(page.getByLabel("Режим данных")).toBeEnabled();
    await page.evaluate((t) => window.sentinel.gmgnOpen(t), target);
    const snapshots = await page.evaluate(
      (t) => window.sentinel.gmgnCapture(t),
      target,
    );
    expect(snapshots[0].feeConversion?.source).toBe("Coinbase");
    expect(snapshots[0].metrics.totalFeesSolEquivalent.value).toBe(68.75);
    const saved = await page.evaluate(
      (t) => window.sentinel.gmgnHistory(t),
      target,
    );
    expect(saved[0].feeConversion?.source).toBe("Coinbase");
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
