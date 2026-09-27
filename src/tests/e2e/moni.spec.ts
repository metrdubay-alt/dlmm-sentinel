import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("Moni: isolated window, capture, persisted history and demo shutdown (fixture)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-moni-e2e-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
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
    await app.evaluate(({ dialog, session }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      session.fromPartition("persist:sentinel-moni").protocol.handle(
        "https",
        () =>
          new Response(
            `<!doctype html><html><body>
        <div class="accountHeaderBlock_links__fixture"><a href="https://x.com/ArtificiallyInu">@ArtificiallyInu</a></div>
        <div class="scoreBlock_scoreNumber__fixture">2180</div>
        <span class="smartsListHeader_smartFollowersCount__fixture">183</span>
        <a class="smartListItem_link__fixture" href="/blknoiz06">Ansem</a>
        <p>ДЕМО-ДАННЫЕ: локальная тестовая карточка, не сайт Moni.</p>
      </body></html>`,
            { headers: { "content-type": "text/html" } },
          ),
      );
    });
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Открыть GetMoni", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Режим данных").selectOption("live");
    await page
      .getByRole("button", { name: "Сохранить настройки", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Открыть GetMoni", exact: true }),
    ).toBeEnabled();
    await page.getByLabel("Аккаунт X для GetMoni").fill("ArtificiallyInu");
    const opened = app.waitForEvent("window");
    await page
      .getByRole("button", { name: "Открыть GetMoni", exact: true })
      .click();
    const remote = await opened;
    await remote.waitForLoadState("domcontentloaded");
    expect(
      await remote.evaluate(() => ({
        node: typeof (window as unknown as { require: unknown }).require,
        bridge: typeof window.sentinel,
      })),
    ).toEqual({ node: "undefined", bridge: "undefined" });
    await page
      .getByRole("button", { name: "Считать показатели", exact: true })
      .click();
    await expect(page.getByText("2180", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText(/Доступные аккаунты \(1\): @blknoiz06/),
    ).toBeVisible();
    await page.getByLabel("Режим данных").selectOption("mock");
    await page
      .getByRole("button", { name: "Сохранить настройки", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Открыть GetMoni", exact: true }),
    ).toBeDisabled();
    await expect.poll(() => remote.isClosed()).toBe(true);
    const rows = await page.evaluate(() =>
      window.sentinel.moniHistory("artificiallyinu"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(2180);
    await page
      .getByRole("heading", { name: "GetMoni · социальное внимание" })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/moni-panel.png" });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
