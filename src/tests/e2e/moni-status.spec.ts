import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("Moni separates missing related profile, available score and verified usage", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-moni-status-"));
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
    await app.evaluate(({ session, dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      session
        .fromPartition("persist:sentinel-moni")
        .protocol.handle("https", (request) => {
          const handle = new URL(request.url).pathname.slice(1);
          const usage = (label: string, used: number) =>
            `<div class="usageLimitsPopover_usageRow__fixture"><span class="usageLimitsPopover_usageLabel__fixture">${label}</span><div role="progressbar" aria-valuenow="${used}"></div></div>`;
          return new Response(
            `<h1>ДЕМО-ДАННЫЕ</h1><a class="sideNavigation_link__fixture" aria-label="Profile">Profile</a><a class="paymentStatus_statusLink__fixture">Free</a><div class="paymentStatus_usagePopover__fixture" hidden>${usage("Daily", 2)}${usage("Weekly", 3)}</div>` +
              (handle === "adolfdevler"
                ? `<div class="accountPage_searchNotFoundContainer__fixture"><span class="searchNotFound_title__fixture">Not found</span></div>`
                : `<div class="accountHeaderBlock_links__fixture"><a href="https://x.com/${handle}">@${handle}</a></div><div class="scoreBlock_scoreNumber__fixture">7154</div>`),
            { headers: { "content-type": "text/html" } },
          );
        });
    });
    const page = await app.firstWindow();
    await page.getByLabel("Режим данных").selectOption("live");
    await expect(page.getByLabel("Режим данных")).toBeEnabled();
    await page.evaluate(() => window.sentinel.moniOpen("adolfdevler"));
    const failure = await page.evaluate(() =>
      window.sentinel.moniCapture("adolfdevler").then(
        () => "unexpected success",
        (e) => e.message,
      ),
    );
    expect(failure).toContain("профиль @adolfdevler не найден");
    expect(failure).not.toContain("лимит");
    const item = page.locator('[data-source="moni"]');
    await expect(item).toContainText("день 2% · неделя 3%");
    await expect(item.locator('[role="alert"]')).toHaveCount(0);
    await page.evaluate(() => window.sentinel.moniOpen("sapijiju"));
    await page.evaluate(() => window.sentinel.moniCapture("sapijiju"));
    expect(
      (await page.evaluate(() => window.sentinel.moniHistory("sapijiju")))[0]
        .score,
    ).toBe(7154);
    await app.evaluate(async ({ BrowserWindow }) => {
      const remote = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith("https://app.moni.ai"),
      )!;
      await remote.webContents.executeJavaScript(
        `document.querySelector('[role="progressbar"]').setAttribute('aria-valuenow','100')`,
      );
    });
    await expect(item.locator('[role="alert"]')).toContainText(
      "Дневной лимит GetMoni исчерпан",
    );
    await expect(item.getByRole("button")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await app.evaluate(async ({ BrowserWindow }) => {
      const remote = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith("https://app.moni.ai"),
      )!;
      await remote.webContents.executeJavaScript(
        `document.querySelector('[role="progressbar"]').setAttribute('aria-valuenow','2')`,
      );
    });
    await expect(item.locator('[role="alert"]')).toHaveCount(0);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
