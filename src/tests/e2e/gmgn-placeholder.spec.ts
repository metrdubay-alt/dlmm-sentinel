import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("GMGN pool-address placeholder is rejected through IPC without saving false zeroes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-gmgn-placeholder-"));
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
  const target = {
    chain: "sol" as const,
    address: "7hvn8egrNGkpQFGyziHxvGkJFWtmoCyXmYYXp4V7tszd",
  };
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole("button", { name: "Карточка токена", exact: true }),
    ).toBeVisible();
    await app.evaluate(({ session, dialog }, target) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      session.fromPartition("persist:sentinel-gmgn").protocol.handle(
        "https",
        () =>
          new Response(
            `<div id="GlobalScrollDomId">
        <a href="https://solscan.io/token/${target.address}">Token</a>
        <div data-sentry-component="InfoItem"><span class="info-item-title">Total Fees</span><span class="info-item-value">0</span></div>
        <div data-sentry-component="PoolItem"><span>Market cap</span><span>$0.0000</span></div>
        <div data-sentry-component="PoolItem"><span>Holders</span><span>0</span></div>
        <div class="bg-card-100"><span>5m</span></div><div><span>Vol</span><span>$0</span></div>
        </div>`,
            { headers: { "content-type": "text/html; charset=utf-8" } },
          ),
      );
      globalThis.fetch = async () => {
        throw new Error("No external network in placeholder fixture");
      };
    }, target);
    await page.evaluate(
      (t) =>
        window.sentinel.workspaceSave({
          target: t,
          label: "Pool address",
          handle: null,
          monitor: false,
          intervalMinutes: 15,
        }),
      target,
    );
    await page.evaluate((t) => window.sentinel.gmgnOpen(t), target);
    const result = await page.evaluate(
      (t) =>
        window.sentinel.workspaceRefresh({
          target: t,
          navigate: false,
          scope: "numeric",
        }),
      target,
    );
    expect(result.errors.gmgn).toMatch(/адрес токена.*адрес пула/);
    expect(result.gmgn).toBeNull();
    expect(
      await page.evaluate((t) => window.sentinel.gmgnHistory(t), target),
    ).toEqual([]);
    expect(result.config.target).toEqual(target);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
