import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("Grok sends one prompt, saves matched response, keeps result on quota error and cancels", async () => {
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
  const install = async (mode: "answer" | "limit" | "wait" | "disabled") =>
    app.evaluate(async ({ session }, mode) => {
      const s = session.fromPartition("persist:sentinel-x");
      try {
        await s.protocol.unhandle("https");
      } catch {
        /* No previous fixture handler on first run. */
      }
      s.protocol.handle(
        "https",
        () =>
          new Response(
            mode === "limit"
              ? '<main><div role="alert">You have reached your usage limit. Try again later.</div></main>'
              : `<main><textarea disabled readonly placeholder="Ask Grok (AI agent)"></textarea><button aria-label="Спросить" disabled><svg><path d="M12 3.59l7.457 7.45-1.414 1.42L13 7.41V21h-2V7.41l-5.043 5.05-1.414-1.42L12 3.59z"></path></svg></button><div id="chat"></div><script>
  setTimeout(()=>{document.querySelector('textarea').disabled=false},1800);
  setTimeout(()=>{document.querySelector('textarea').readOnly=false},2400);
  document.querySelector('textarea').addEventListener('input',()=>{if(${JSON.stringify(mode)}==='disabled')return;setTimeout(()=>{document.querySelector('button').disabled=false},1200)});
  const t=document.querySelector('textarea');t.focus=()=>{throw new Error('Hidden editor must not require focus')};let sent=0;
  document.querySelector('button').addEventListener('click',()=>{sent++;document.body.dataset.sent=String(sent);const prompt=t.value;t.value='';document.querySelector('#chat').textContent=prompt;
  if(${JSON.stringify(mode)}==='wait')return;
  const sample=JSON.parse(prompt.split('по этой форме: ')[1].split('\\nДля каждого')[0]);
  const answer={...sample,narrativeDetails:{essence:'ДЕМО: идея и механизм комиссий',adoption:'ДЕМО: два независимых автора и проекты',momentum:'ДЕМО: интерес растёт за 7 дней'},discoveredProfile:{handle:'example',sources:['https://x.com/example/status/123']},tokenSymbol:'DEMO',description:'ДЕМО-ДАННЫЕ: найден независимый интерес',score:62,scoreReason:'Оценка Grok по тестовым источникам',narrative:'stable',sources:['https://x.com/example/status/123'],redFlags:[{text:'ДЕМО: профиль не подтвержден',sources:[]},{text:'3% transfer tax на все трансферы $WOW',sources:['https://example.com/fee']},{text:'ДЕМО: повторяющиеся промо-посты',sources:['https://x.com/example/status/123']}]};
  const block=document.createElement('div');const content=document.createElement('pre');content.textContent=JSON.stringify(answer);content.innerHTML=content.innerHTML.replace('независимый интерес','независимый <span style="display:block">интерес</span>');block.append(content);const actions=document.createElement('div');actions.innerHTML='<button aria-label="Copy text">Copy</button><button aria-label="Regenerate">Regenerate</button>';block.append(actions);document.querySelector('#chat').append(block);
  });</script></main>`,
            { headers: { "content-type": "text/html; charset=utf-8" } },
          ),
      );
    }, mode);
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    });
    await page.evaluate(async (target) => {
      await window.sentinel.workspaceSave({
        target,
        label: "ДЕМО GROK",
        handle: null,
        monitor: false,
        intervalMinutes: 15,
      });
    }, target);
    await page.getByText("Настройки режима", { exact: true }).click();
    await page.getByLabel("Режим данных").selectOption("mock");
    await expect(page.getByLabel("Режим данных")).toBeEnabled();
    await expect(
      page.evaluate((t) => window.sentinel.grokRun(t), target),
    ).rejects.toThrow(/демо/);
    await page.getByLabel("Режим данных").selectOption("live");
    await expect(page.getByLabel("Режим данных")).toBeEnabled();
    await app.evaluate(({ session }) => {
      session
        .fromPartition("persist:sentinel-gmgn")
        .protocol.handle(
          "https",
          () =>
            new Response(
              '<div id="GlobalScrollDomId" data-sentry-component="BaseLinkView"><a href="https://x.com/weightlesswires/status/2105251378750742998">X</a><a href="https://x.com/search?q=wallet">Search</a></div>',
              { headers: { "content-type": "text/html" } },
            ),
        );
    });
    await page.evaluate((t) => window.sentinel.gmgnOpen(t), target);
    await install("answer");
    const report = await page.evaluate(
      (t) => window.sentinel.grokRun(t),
      target,
    );
    expect(report.grok?.answer.score).toBe(62);
    expect(report.grok?.answer.unknowns.join(" ")).toContain(
      "ДЕМО: профиль не подтвержден",
    );
    expect(
      report.grok?.answer.redFlags.every((f) => f.sources.length > 0),
    ).toBe(true);
    expect(report.config.handle).toBe("example");
    expect(report.config.label).toBe("ДЕМО GROK");
    const grok = app
      .windows()
      .find((w) => w.url().startsWith("https://x.com/i/grok"))!;
    expect(await grok.locator("body").getAttribute("data-sent")).toBe("1");
    await expect(grok.locator("body")).toContainText(
      "https://x.com/weightlesswires/status/2105251378750742998",
    );
    await expect(grok.locator("body")).not.toContainText(
      "https://x.com/search?q=wallet",
    );
    await page.bringToFront();
    await page.getByRole("button", { name: "Архив", exact: true }).click();
    await page
      .getByRole("row")
      .filter({ hasText: "ДЕМО GROK" })
      .getByRole("button", { name: "Открыть карточку", exact: true })
      .click();
    await expect(
      page.getByText("62 / 100 · Grok", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("ДЕМО: повторяющиеся промо-посты", { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator(".grok-analysis .amber-text")
        .filter({ hasText: "transfer tax" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Суть нарратива", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Кто подхватил", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Актуальность", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/ссылки автоматически не подтверждаются/),
    ).toHaveCount(0);
    await page.screenshot({
      path: "test-results/grok-result.png",
      fullPage: true,
    });
    await page.evaluate(() => window.sentinel.sourceLogin("grok"));
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes("/i/grok"))!
          .isVisible(),
      ),
    ).toBe(true);
    await install("limit");
    await expect(
      page.evaluate((t) => window.sentinel.grokRun(t), target),
    ).rejects.toThrow(/лимит/i);
    expect(
      (await page.evaluate((t) => window.sentinel.workspaceReport(t), target))
        .grok?.requestId,
    ).toBe(report.grok?.requestId);
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes("/i/grok"))!
          .isVisible(),
      ),
    ).toBe(false);
    await install("disabled");
    await expect(
      page.evaluate((t) => window.sentinel.grokRun(t), target),
    ).rejects.toThrow(/Запрос не отправлен/);
    expect(await grok.locator("textarea").inputValue()).toBe("");
    expect(await grok.locator("body").getAttribute("data-sent")).toBeNull();
    await install("wait");
    const pending = page.evaluate(
      (t) => window.sentinel.grokRun(t).catch((e) => e.message),
      target,
    );
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.sentinel.grokStatus(undefined)))
            .phase,
      )
      .toBe("waiting");
    await expect(
      page.evaluate((t) => window.sentinel.grokRun(t), target),
    ).rejects.toThrow(/выполняется/);
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes("/i/grok"))!
          .isVisible(),
      ),
    ).toBe(false);
    await page.evaluate(() => window.sentinel.grokCancel(undefined));
    expect(await pending).toMatch(/отмен/i);
    expect(
      (await page.evaluate((t) => window.sentinel.workspaceReport(t), target))
        .grok?.requestId,
    ).toBe(report.grok?.requestId);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
