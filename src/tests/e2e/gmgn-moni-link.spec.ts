import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("GMGN profile gets a Moni score with no Grok result", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-gmgn-moni-"));
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
    executablePath,
    args: executablePath ? [] : ["."],
    env,
  });
  try {
    const target = {
      chain: "bsc" as const,
      address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
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
              `<div id="GlobalScrollDomId"><a href="https://bscscan.com/token/${target.address}">Token</a><div data-sentry-component="BaseLinkView"><a href="https://x.com/BagsPay">X</a></div><a href="https://x.com/unrelated">Trade feed account</a></div>`,
              { headers: { "content-type": "text/html" } },
            ),
        );
      session
        .fromPartition("persist:sentinel-moni")
        .protocol.handle(
          "https",
          () =>
            new Response(
              '<div class="accountHeaderBlock_links__fixture"><a href="https://x.com/bagspay">@bagspay</a></div><div class="scoreBlock_scoreNumber__fixture">115</div>',
              { headers: { "content-type": "text/html" } },
            ),
        );
    }, target);
    const page = await app.firstWindow();
    await expect(
      page.getByText("Настройки режима", { exact: true }),
    ).toBeVisible();
    await page.evaluate(
      (target) =>
        window.sentinel.workspaceSave({
          target,
          label: "BAGSPAY",
          handle: null,
          relatedAccounts: [],
          monitor: false,
          intervalMinutes: 15,
        }),
      target,
    );
    const result = await page.evaluate(
      (target) => window.sentinel.workspaceRefresh({ target, navigate: true }),
      target,
    );
    expect(result.config.handle).toBeNull();
    expect(result.config.relatedAccounts?.map((a) => a.handle)).toEqual([
      "bagspay",
    ]);
    expect(result.relatedMoni?.[0].snapshot?.score).toBe(115);
    await page.getByRole("button", { name: "Архив", exact: true }).click();
    await page
      .getByRole("row")
      .filter({ hasText: "BAGSPAY" })
      .getByRole("button", { name: "Открыть карточку", exact: true })
      .click();
    const row = page
      .getByRole("table", { name: "Moni Score аккаунтов" })
      .getByRole("row")
      .filter({ hasText: "@bagspay" });
    await expect(row).toContainText("Профиль из карточки GMGN");
    await expect(row).toContainText("115");
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
