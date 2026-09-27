import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("account status is independent of open windows and quota; no token needed", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-connections-"));
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
    await app.evaluate(({ session, dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      for (const partition of [
        "persist:sentinel-gmgn",
        "persist:sentinel-moni",
        "persist:sentinel-x",
      ]) {
        session
          .fromPartition(partition)
          .protocol.handle(
            "https",
            () =>
              new Response(
                '<h1>ДЕМО-ДАННЫЕ</h1><button id="account">Sign in</button><div role="alert" id="notice"></div><article><button>Log out</button><div role="alert">You have reached your daily limit</div></article>',
                { headers: { "content-type": "text/html" } },
              ),
          );
      }
    });
    const page = await app.firstWindow();
    await page.getByLabel("Режим данных").selectOption("live");
    for (const [source, label] of [
      ["x", "X"],
      ["grok", "Grok"],
      ["gmgn", "GMGN"],
      ["moni", "Getmoni"],
    ] as const) {
      const button = page.getByRole("button", {
        name: `Аккаунт ${label}`,
        exact: true,
      });
      await expect(button).toHaveAttribute(
        "aria-pressed",
        source === "grok" ? "true" : "false",
      );
      const opened = app.waitForEvent("window");
      await button.click();
      const remote = await opened;
      await expect(button).toContainText("Нужен вход");
      await expect(
        page.locator(`[data-source="${source}"] [role="alert"]`),
      ).toHaveCount(0);
      await remote.evaluate((source) => {
        const account = document.querySelector("#account")!;
        if (source === "gmgn")
          account.outerHTML =
            '<div data-sentry-component="Connect"><button><svg data-icon="IconWallet16pxRegular"></svg><img data-icon="IconRobinhoodeth16pxS" alt=""><span>0</span></button></div>';
        else if (source === "moni")
          account.outerHTML =
            '<a class="sideNavigation_link__fixture" aria-label="Profile">Profile</a><a class="paymentStatus_statusLink__fixture">Free</a>';
        else account.textContent = "Log out";
        document.querySelector("#notice")!.textContent =
          "You have reached your daily limit";
      }, source);
      // The same X session has an old signed-in window when Grok opens a signed-out fixture: explicit logout wins.
      if (source === "grok")
        await expect(
          page.getByRole("button", { name: "Аккаунт X", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.locator(`[data-source="${source}"] [role="alert"]`),
      ).toContainText("Лимит исчерпан");
      await remote.evaluate(() => {
        document.querySelector("#notice")!.textContent = "";
      });
      await expect(
        page.locator(`[data-source="${source}"] [role="alert"]`),
      ).toHaveCount(0);
    }
    await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.getURL() === "https://x.com/home",
      );
      await w!.webContents.executeJavaScript(
        `document.querySelector('#account').textContent='Sign in'`,
      );
    });
    await expect(
      page.getByRole("button", { name: "Аккаунт X", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      page.getByRole("button", { name: "Аккаунт Grok", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await page.screenshot({
      path: "test-results/connections-0319.png",
      fullPage: true,
    });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
