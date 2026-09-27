import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("one new-token button runs GMGN Grok X Moni and pools", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-grok-"));
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
  app.on("window", (w) => {
    w.on("pageerror", (e) => console.log("GROK PAGE ERROR", e.message));
  });
  const target = {
    chain: "bsc" as const,
    address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
  };
  const install = async (mode: "answer" | "limit" | "wait") =>
    app.evaluate(async ({ session }, mode) => {
      const s = session.fromPartition("persist:sentinel-x");
      try {
        await s.protocol.unhandle("https");
      } catch {
        /* No previous fixture handler on first run. */
      }
      s.protocol.handle(
        "https",
        (request) =>
          new Response(
            !request.url.includes("/i/grok")
              ? `<main><div data-testid="primaryColumn"><div data-testid="UserName">Example @example</div><div data-testid="UserDescription">CA 0xcafdbce93477261db8250e42bdae6e66733f9e20</div><div data-testid="UserProfileHeader_Items"><span data-testid="UserJoinDate">Joined February 2012</span></div><a href="/example/verified_followers">2,001 Followers</a><a href="/example/following">20 Following</a></div></main>`
              : mode === "limit"
                ? '<main><div role="alert">You have reached your usage limit. Try again later.</div></main>'
                : `<main><textarea placeholder="Ask Grok (AI agent)"></textarea><button aria-label="Grok something">Send</button><div id="chat"></div><script>
  const t=document.querySelector('textarea');let sent=0;
  document.querySelector('button').addEventListener('click',()=>{sent++;document.body.dataset.sent=String(sent);const prompt=t.value;t.value='';document.querySelector('#chat').textContent=prompt;
  if(${JSON.stringify(mode)}==='wait')return;
  const sample=JSON.parse(prompt.split('по этой форме: ')[1].split('\\nДля каждого')[0]);
  const answer={...sample,relatedAccounts:[{handle:'recipient',role:'fee_recipient',source:'https://example.com/token'}],discoveredProfile:{handle:'example',sources:['https://x.com/example/status/123']},tokenSymbol:'DEMO',description:'ДЕМО-ДАННЫЕ: найден независимый интерес',score:62,scoreReason:'Оценка Grok по тестовым источникам',narrative:'stable',sources:['https://x.com/example/status/123'],redFlags:[{text:'ДЕМО: повторяющиеся промо-посты',sources:['https://x.com/example/status/123']}]};
  const block=document.createElement('div');const content=document.createElement('pre');content.textContent=JSON.stringify(answer);content.innerHTML=content.innerHTML.replace('независимый интерес','независимый <span style="display:block">интерес</span>');block.append(content);const actions=document.createElement('div');actions.innerHTML='<button aria-label="Copy text">Copy</button><button aria-label="Regenerate">Regenerate</button>';block.append(actions);document.querySelector('#chat').append(block);
  });</script></main>`,
            { headers: { "content-type": "text/html; charset=utf-8" } },
          ),
      );
    }, mode);
  try {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    });
    await install("answer");
    await app.evaluate(({ session }, target) => {
      session
        .fromPartition("persist:sentinel-gmgn")
        .protocol.handle(
          "https",
          () =>
            new Response(
              `<div id="GlobalScrollDomId"><a href="https://bscscan.com/token/${target.address}">Token</a><div data-sentry-component="InfoItem"><span class="info-item-title">Top 10</span><span class="info-item-value">12%</span></div></div>`,
              { headers: { "content-type": "text/html" } },
            ),
        );
      session
        .fromPartition("persist:sentinel-moni")
        .protocol.handle("https", (request) => {
          if (new URL(request.url).hostname === "twitter-bot.getmoni.io")
            return Response.json(
              { username: "recipient", score: 10949, smartFollowersCount: 811 },
              { headers: { "access-control-allow-origin": "*" } },
            );
          const html =
            '<a class="accountHeaderBlock_links" href="https://x.com/example">example</a><div class="accountHeaderBlock_links"><a href="https://x.com/example">@example</a></div><div class="scoreBlock_scoreNumber">100</div><div class="smartsListHeader_smartFollowersCount">2</div>'.replaceAll(
              "example",
              new URL(request.url).pathname.slice(1),
            );
          return new Response(
            new URL(request.url).pathname === "/recipient"
              ? html.replace(">100</div>", "><span></span></div>") +
                  '<script>fetch("https://twitter-bot.getmoni.io/api/observed/recipient/")</script>'
              : html,
            { headers: { "content-type": "text/html" } },
          );
        });
      const original = globalThis.fetch;
      globalThis.fetch = async (input, options) => {
        const url = String(input);
        if (!url.startsWith("https://api.geckoterminal.com/"))
          return original(input, options);
        const pool = {
          attributes: {
            address: "0x7a907a283ef913eb25bee3afd110f687a3fb7eed",
            name: "DEMO / USDT 1%",
            reserve_in_usd: "5000",
            volume_usd: { m5: "5000", h1: "60000", h24: "100000" },
          },
          relationships: {
            base_token: { data: { id: `bsc_${target.address}` } },
          },
        };
        const end = Math.floor(Date.now() / 60000) * 60 - 60;
        return Response.json(
          url.includes("ohlcv")
            ? {
                data: {
                  attributes: {
                    ohlcv_list: Array.from({ length: 65 }, (_, i) => [
                      end - (i + 1) * 60,
                      1,
                      1,
                      1,
                      1,
                      1000,
                    ]),
                  },
                },
              }
            : { data: [pool] },
        );
      };
    }, target);
    const page = await app.firstWindow();
    await page.getByLabel("Режим данных").selectOption("live");
    await page.evaluate(async () => {
      for (const source of ["gmgn", "x", "moni"] as const)
        await window.sentinel.sourceLogin(source);
    });
    await page.bringToFront();
    await page.getByLabel("Сеть карточки").selectOption("bsc");
    await page.getByLabel("Адрес карточки").fill(target.address);
    await expect(page.getByLabel("Тикер карточки")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Запустить анализ", exact: true })
      .click();
    await expect(page.getByLabel("Этапы анализа")).toBeVisible();
    await expect(
      page.getByText(
        "Анализ завершён. Результаты сохранены в карточке и архиве.",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 45000 });
    await expect(page.locator(".token-header h1")).toContainText("DEMO");
    const report = await page.evaluate(
      (t) => window.sentinel.workspaceReport(t),
      target,
    );
    expect(report.gmgn?.metrics.top10Pct.value).toBe(12);
    expect(report.grok?.answer.score).toBe(62);
    expect(report.config.handle).toBe("example");
    expect(report.moni?.score).toBe(100);
    expect(report.relatedMoni?.[0].snapshot?.handle).toBe("recipient");
    expect(report.relatedMoni?.[0].snapshot?.score).toBe(10949);
    await expect(page.getByLabel("Moni Score аккаунтов")).toContainText(
      "Получатель комиссий",
    );
    expect(report.x?.handle).toBe("example");
    expect(
      (await page.evaluate((t) => window.sentinel.poolsLatest(t), target))
        ?.rows,
    ).toHaveLength(1);
    const grok = app.windows().find((w) => w.url().includes("/i/grok"))!;
    expect(await grok.locator("body").getAttribute("data-sent")).toBe("1");
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .filter((w) => w.webContents.getURL().startsWith("https:"))
          .map((w) => w.isVisible()),
      ),
    ).toEqual([false, false, false, false]);
    await page.bringToFront();
    await page.screenshot({
      path: "test-results/new-token-analysis.png",
      fullPage: true,
    });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
