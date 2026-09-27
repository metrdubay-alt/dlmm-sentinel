import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
} from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("X fixture session survives application exit and is erased by demo switch", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-session-e2e-"));
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
  let app: ElectronApplication | undefined;
  try {
    app = await launch();
    await expect(
      (await app.firstWindow()).getByRole("button", {
        name: "Карточка токена",
        exact: true,
      }),
    ).toBeVisible();
    await app.evaluate(({ dialog, session }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      for (const partition of ["sentinel-x", "persist:sentinel-x"])
        session.fromPartition(partition).protocol.handle(
          "https",
          () =>
            new Response("<h1>ДЕМО-ДАННЫЕ: тест сохранения входа</h1>", {
              headers: { "content-type": "text/html" },
            }),
        );
    });
    const page = await app.firstWindow();
    await page.getByLabel("Режим данных").selectOption("live");
    await expect(page.getByLabel("Режим данных")).toBeEnabled();
    await page.evaluate(async () => {
      const target = {
        chain: "bsc" as const,
        address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
      };
      await window.sentinel.workspaceSave({
        target,
        label: "fixture",
        handle: "example",
        monitor: false,
        intervalMinutes: 15,
        moniEnabled: false,
      });
      await window.sentinel.workspaceOpen({ target, source: "x" });
    });
    const connection = await page.evaluate(async () => {
      const target = {
        chain: "bsc" as const,
        address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
      };
      await window.sentinel.workspaceOpen({ target, source: "grok" });
      return window.sentinel.workspaceSources(target);
    });
    expect(connection).toEqual({
      gmgn: false,
      x: true,
      moni: false,
      grok: true,
    });
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL() === "https://x.com/i/grok")
        ?.close();
    });
    expect(
      await page.evaluate(() =>
        window.sentinel.workspaceSources({
          chain: "bsc",
          address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
        }),
      ),
    ).toMatchObject({ x: true, grok: false });
    await app.evaluate(async ({ BrowserWindow }) => {
      const source = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.getURL() === "https://x.com/example",
      );
      if (!source) throw new Error("Source window missing");
      await source.webContents.session.cookies.set({
        url: "https://x.com",
        name: "sentinel_fixture",
        value: "DEMO_ONLY",
        expirationDate: Date.now() / 1000 + 3600,
        secure: true,
      });
    });
    await app.close();
    app = undefined;
    app = await launch();
    await expect(
      (await app.firstWindow()).getByRole("button", {
        name: "Карточка токена",
        exact: true,
      }),
    ).toBeVisible();
    const restored = await app.evaluate(async ({ session }) =>
      (
        await session
          .fromPartition("persist:sentinel-x")
          .cookies.get({ name: "sentinel_fixture" })
      ).map((c) => c.value),
    );
    expect(restored).toEqual(["DEMO_ONLY"]);
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    });
    const reopened = await app.firstWindow();
    await reopened.getByLabel("Режим данных").selectOption("mock");
    await expect(reopened.getByLabel("Режим данных")).toBeEnabled();
    await expect
      .poll(async () =>
        app!.evaluate(
          async ({ session }) =>
            (
              await session
                .fromPartition("persist:sentinel-x")
                .cookies.get({ name: "sentinel_fixture" })
            ).length,
        ),
      )
      .toBe(0);
  } finally {
    await app?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
