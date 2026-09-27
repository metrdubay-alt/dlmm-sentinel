import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("unified workspace: three isolated sources, persisted report, change alerts and demo pause", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-unified-e2e-"));
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
  const address = "F9PvspnWkP3hSLaYxQb2LvFRBgyrLVhdUJ5q39tZZPbC";
  const target = { chain: "sol" as const, address };
  try {
    await app.evaluate(({ session, dialog }, address) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      const html = (s: string) =>
        new Response("<h1>ДЕМО-ДАННЫЕ — fixture</h1>" + s, {
          headers: { "content-type": "text/html" },
        });
      session
        .fromPartition("persist:sentinel-gmgn")
        .protocol.handle("https", () =>
          html(
            `<div id="GlobalScrollDomId"><a href="https://solscan.io/token/${address}">Token</a><div data-sentry-component="InfoItem"><span class="info-item-title">Top 10</span><span class="info-item-value" id="top">15%</span></div></div>`,
          ),
        );
      session
        .fromPartition("persist:sentinel-x")
        .protocol.handle("https", () =>
          html(
            `<main><div data-testid="primaryColumn"><div data-testid="UserName">Example @example</div><div data-testid="UserDescription">CA ${address}</div><div data-testid="UserProfileHeader_Items"><span data-testid="UserJoinDate">Joined February 2012</span><a href="https://t.co/example">example.test</a></div><a href="/example/verified_followers">2,001 Followers</a><a href="/example/following">20 Following</a><article data-testid="tweet"><div data-testid="User-Name"><a href="/example">Example</a></div><a href="/example/status/123456789"><time datetime="2026-09-26T00:00:00.000Z">Today</time></a><div data-testid="tweetText">Example claim rewards</div></article></div></main>`,
          ),
        );
      session
        .fromPartition("persist:sentinel-moni")
        .protocol.handle("https", () =>
          html(
            `<div class="accountHeaderBlock_links"><a href="https://x.com/example">@example</a></div><div class="scoreBlock_scoreNumber" id="score">100</div><div class="smartsListHeader_smartFollowersCount">2</div>`,
          ),
        );
    }, address);
    const page = await app.firstWindow();
    await page.getByLabel("Режим данных").selectOption("mock");
    await expect(page.getByLabel("Режим данных")).toBeEnabled();
    await page
      .getByRole("button", { name: "Карточка токена", exact: true })
      .click();
    await page.getByLabel("Адрес карточки").fill(address);
    await page
      .getByRole("button", { name: "Сохранить карточку", exact: true })
      .click();
    await page.getByLabel("Режим данных").selectOption("live");
    await page.getByRole("button", { name: "Изменить", exact: true }).click();
    await page.getByLabel("Тикер карточки").fill("Проверка");
    await page.getByLabel("Профиль X карточки").fill("example");
    await page
      .getByRole("button", { name: "Сохранить карточку", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: /Проверка/ })).toBeVisible();
    for (const name of ["GMGN", "X", "Moni"]) {
      const opened = app.waitForEvent("window");
      await page
        .getByRole("button", { name: `Открыть ${name}`, exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: `● Открыто: ${name}`, exact: true }),
      ).toHaveAttribute("aria-pressed", "false");
      const remote = await opened;
      await remote.waitForLoadState("domcontentloaded");
      expect(await remote.evaluate(() => typeof window.sentinel)).toBe(
        "undefined",
      );
      await expect(
        page.getByRole("button", {
          name: "Прочитать открытые источники",
          exact: true,
        }),
      ).toBeEnabled();
    }
    await expect(
      page.getByRole("button", { name: "Числовой анализ GMGN", exact: true }),
    ).toHaveCount(0);
    const grokWindow = app.waitForEvent("window");
    await page
      .getByRole("button", { name: "Открыть Grok", exact: true })
      .click();
    const grok = await grokWindow;
    await expect(
      page.getByRole("button", { name: "● Открыто: Grok", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await grok.close();
    await expect(
      page.getByRole("button", { name: "Открыть Grok", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await page
      .getByRole("button", {
        name: "Прочитать открытые источники",
        exact: true,
      })
      .click();
    await expect(
      page.getByText(/Одна кнопка отправляет запрос в Grok/),
    ).toBeVisible();
    await page.getByText(/Темы публикаций ·/).click();
    await expect(page.getByText(/Заявления автора о выплатах/)).toBeVisible();
    await expect(page.getByText(/Упоминания claim/)).toBeVisible();
    await page.getByText(/Найденные домены ·/).click();
    await expect(
      page.locator("code").filter({ hasText: "example.test" }),
    ).toBeVisible();
    await expect(page.getByText(/GetMoni ·.*Score/)).toContainText("100");
    let r = await page.evaluate(
      (t) => window.sentinel.workspaceReport(t),
      target,
    );
    expect(r.x?.posts).toHaveLength(1);
    expect(r.x?.followers).toBe(2001);
    expect(r.gmgn?.metrics.top10Pct.value).toBe(15);
    const topValue = page
      .getByRole("row")
      .filter({ hasText: "Top 10, %" })
      .locator(".metric-value");
    await expect(topValue).toHaveAttribute("data-tone", "neutral");
    expect(r.x?.official).toBe(false);
    const remoteG = app
        .windows()
        .find((w) => w.url().startsWith("https://gmgn.ai"))!,
      remoteM = app
        .windows()
        .find((w) => w.url().startsWith("https://app.moni.ai"))!,
      remoteX = app.windows().find((w) => w.url().startsWith("https://x.com"))!;
    await remoteG.locator("#top").evaluate((e) => {
      e.textContent = "23%";
    });
    await remoteM.locator("#score").evaluate((e) => {
      e.textContent = "6";
    });
    await page
      .getByRole("button", {
        name: "Прочитать открытые источники",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Прочитать открытые источники",
        exact: true,
      }),
    ).toBeEnabled();
    r = await page.evaluate((t) => window.sentinel.workspaceReport(t), target);
    await expect(topValue).toHaveAttribute("data-tone", "bad");
    await expect(topValue).toHaveAttribute("title", /22%/);
    const alerts = r.alerts.length;
    await page
      .getByRole("button", {
        name: "Прочитать открытые источники",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Прочитать открытые источники",
        exact: true,
      }),
    ).toBeEnabled();
    expect(
      (await page.evaluate((t) => window.sentinel.workspaceReport(t), target))
        .alerts,
    ).toHaveLength(alerts);
    await remoteX.locator('[data-testid="UserName"]').evaluate((e) => {
      e.textContent = "";
    });
    await page
      .getByRole("button", {
        name: "Прочитать открытые источники",
        exact: true,
      })
      .click();
    await expect(page.getByText(/^x: Не удалось прочитать/)).toBeVisible();
    r = await page.evaluate((t) => window.sentinel.workspaceReport(t), target);
    expect(r.x?.state).toBe("available");
    expect(r.alerts.some((a) => a.code === "X_UNAVAILABLE")).toBe(false);
    const lastAttempt = r.lastAttempt;
    await page.evaluate(async (target) => {
      const current = await window.sentinel.workspaceReport(target);
      await window.sentinel.workspaceSave({
        ...current.config,
        monitor: true,
        intervalMinutes: 5,
      });
    }, target);
    await app.evaluate(() => {
      const advanced = Date.now() + 6 * 60000;
      Date.now = () => advanced;
    });
    await expect
      .poll(
        async () =>
          (
            await page.evaluate(
              (t) => window.sentinel.workspaceReport(t),
              target,
            )
          ).lastAttempt,
        { timeout: 40000 },
      )
      .not.toBe(lastAttempt);
    await app.evaluate(() => {
      Date.now = () => new Date().getTime();
    });
    r = await page.evaluate((t) => window.sentinel.workspaceReport(t), target);
    expect(r.errors).toEqual({});
    await page.getByRole("button", { name: "Изменить", exact: true }).click();
    await page.getByLabel(/Использовать GetMoni при обновлении/).uncheck();
    await page
      .getByRole("button", { name: "Сохранить карточку", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: /(?:Открыть |Открыто: )Moni/ }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: /(?:Открыть |Открыто: )Moni/ })
      .click();
    await expect(page.getByText(/GetMoni отключён/).first()).toBeVisible();
    const disabled = await page.evaluate(
      (t) => window.sentinel.workspaceReport(t),
      target,
    );
    expect(disabled.config.moniEnabled).toBe(false);
    expect(disabled.moni).toEqual(r.moni);
    await page.getByRole("button", { name: "Архив", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Архив", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("row")
      .filter({ hasText: "Проверка" })
      .getByRole("button", { name: "Открыть карточку", exact: true })
      .click();
    await page.getByRole("button", { name: "Изменить", exact: true }).click();
    await expect(page.getByLabel("Адрес карточки")).toHaveValue(address);
    await expect(page.getByLabel("Тикер карточки")).toHaveValue("Проверка");
    await page.screenshot({ path: "test-results/unified-workspace.png" });
    await page.getByLabel("Режим данных").selectOption("mock");
    await expect(page.getByLabel("Режим данных")).toBeEnabled();
    await expect.poll(() => remoteX.isClosed()).toBe(true);
    expect(
      await page.evaluate(async (target) => {
        try {
          await window.sentinel.workspaceRefresh({ target, navigate: true });
          return false;
        } catch {
          return true;
        }
      }, target),
    ).toBe(true);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
