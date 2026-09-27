import { readConnection } from "./source-connection";
import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import { XBrowser } from "./x-browser";
import {
  buildGrokPrompt,
  parseGrokAnswer,
  grokResultSchema,
  type GrokStatus,
  type GrokContext,
} from "../../shared/analysis/grok";
import type { WorkspaceConfig } from "../../shared/analysis/workspace";
// Only the public Grok DOM. No page globals, cookies, tokens or private endpoints.
export const GROK_STATE_SCRIPT = String.raw`(() => {
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
 const editors=[...document.querySelectorAll('textarea')].filter(visible);
 const buttons=[...document.querySelectorAll('button')].filter(visible);
 const label=e=>(e.getAttribute('aria-label')||e.innerText||'').trim();
 const copies=buttons.filter(b=>/^(Copy text|Копировать текст|Скопировать текст)$/i.test(label(b)));
 const stop=buttons.some(b=>/^(Stop|Stop generating|Stop response|Остановить|Остановить генерацию|Остановить ответ)$/i.test(label(b)));
 let answer='';let node=copies.at(-1);
 for(let i=0;node&&i<9;i++,node=node.parentElement){
  if(node.querySelectorAll('button[aria-label="Copy text"],button[aria-label="Копировать текст"],button[aria-label="Скопировать текст"]').length>1)break;
  if((node.innerText||'').includes('{')){answer=node.textContent||'';break;}
 }
 const body=(document.querySelector('main')||document.body).innerText||'';
 const notices=[...document.querySelectorAll('[role="alert"],[role="alertdialog"]')].filter(visible).map(e=>e.innerText).join('\n');
 let blocked='';
 if(/(?:reached|hit|exceeded).{0,60}(?:limit|quota)|rate.limit|too many requests|лимит.{0,50}(?:исчерпан|достигнут)|(?:исчерпан|достигнут).{0,50}лимит/i.test(notices)||/(?:^|\n)(?:You(?:'ve| have) (?:reached|hit)|Usage limit|Rate limit|Вы достигли|Лимит исчерпан)/i.test(body))blocked='Лимит Grok исчерпан. Повторите после восстановления лимита.';
 else if(/verify.{0,30}human|captcha|подтвердите.{0,30}человек/i.test(notices)||[...document.querySelectorAll('iframe[title]')].some(e=>visible(e)&&/captcha|challenge/i.test(e.title)))blocked='Grok требует проверку. Откройте Grok кнопкой входа и завершите её.';
 else if(!editors.length&&(/sign in|log in|войти/i.test(notices)||[...document.querySelectorAll('a[href*="/login"],a[href*="/i/flow/login"]')].some(visible)))blocked='В сессии приложения требуется вход в X. Откройте X кнопкой входа.';
 return {editorCount:editors.length,value:editors[0]?.value??'',copies:copies.length,stop,answer:answer.slice(0,80001),body:body.slice(0,100000),blocked};
})()`;
type State = {
  editorCount: number;
  value: string;
  copies: number;
  stop: boolean;
  answer: string;
  body: string;
  blocked: string;
};
export class GrokBrowser extends XBrowser {
  override connection() {
    return readConnection(this.window, "grok");
  }
  override async openAccount(parent: BrowserWindow) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      return true;
    }
    return this.openGrok(parent);
  }
  private busy = false;
  private cancelled = false;
  private state: GrokStatus = {
    target: null,
    phase: "idle",
    startedAt: null,
    error: null,
  };
  status() {
    return { ...this.state };
  }
  override async openGrok(parent: BrowserWindow) {
    if (this.busy) throw new Error("Анализ Grok уже выполняется.");
    return super.openGrok(parent);
  }
  cancel() {
    if (!this.busy) return false;
    this.cancelled = true;
    super.close();
    return true;
  }
  override close() {
    if (this.busy) this.cancelled = true;
    super.close();
  }
  private check(win: BrowserWindow) {
    if (this.cancelled) throw new Error("Анализ Grok отменён.");
    if (win.isDestroyed() || this.window !== win)
      throw new Error("Окно Grok закрыто. Анализ остановлен.");
    const u = new URL(win.webContents.getURL());
    if (u.origin !== "https://x.com" || u.pathname !== "/i/grok")
      throw new Error("Grok открыт на другой странице. Анализ остановлен.");
  }
  async run(config: WorkspaceConfig, parent: BrowserWindow) {
    if (this.busy) throw new Error("Анализ Grok уже выполняется.");
    this.busy = true;
    this.cancelled = false;
    const context: GrokContext = {
      target: config.target,
      handle: config.handle,
      requestId: randomUUID(),
      startedAt: new Date().toISOString(),
    };
    this.state = {
      target: context.target,
      phase: "opening",
      startedAt: context.startedAt,
      error: null,
    };
    try {
      await super.openGrok(parent, true);
      const win = this.window!;
      let observed: State | undefined;
      const readyUntil = Date.now() + 30000;
      while (Date.now() < readyUntil) {
        this.check(win);
        observed = await win.webContents.executeJavaScript(GROK_STATE_SCRIPT);
        if (observed!.blocked) throw new Error(observed!.blocked);
        if (observed!.editorCount === 1) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (!observed || observed.editorCount !== 1)
        throw new Error(
          "Поле Grok не найдено. Откройте Grok кнопкой входа для проверки.",
        );
      if (observed.copies || observed.value.trim())
        throw new Error(
          "В Grok открыт старый чат или черновик. Откройте новый чат и повторите анализ.",
        );
      this.check(win);
      this.state.phase = "sending";
      this.check(win);
      const prompt = buildGrokPrompt(context);
      const filled = await win.webContents.executeJavaScript(
        `(() => {const u=new URL(location.href);if(u.origin!=="https://x.com"||u.pathname!=="/i/grok")return false;const nodes=[...document.querySelectorAll('textarea')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');if(nodes.length!==1||nodes[0].value.trim()||nodes[0].disabled)return false;const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;if(!setter)return false;setter.call(nodes[0],${JSON.stringify(prompt)});nodes[0].dispatchEvent(new Event('input',{bubbles:true}));return true;})()`,
      );
      if (!filled)
        throw new Error("Поле запроса Grok изменилось. Запрос не отправлен.");
      await new Promise((r) => setTimeout(r, 250));
      this.check(win);
      observed = await win.webContents.executeJavaScript(GROK_STATE_SCRIPT);
      if (observed!.value !== prompt)
        throw new Error(
          "Не удалось заполнить запрос Grok. Запрос не отправлен.",
        );
      // Exactly one submission; no retry that could spend quota twice.
      const submitted = await win.webContents.executeJavaScript(`(() => {
        const u=new URL(location.href);if(u.origin!=="https://x.com"||u.pathname!=="/i/grok")return false;
        const buttons=[...document.querySelectorAll('button[aria-label="Grok something"]')].filter(b=>b.getClientRects().length&&!b.disabled&&b.getAttribute('aria-disabled')!=='true');
        if(buttons.length!==1)return false;buttons[0].click();return true;
      })()`);
      if (!submitted)
        throw new Error(
          "Кнопка отправки Grok не найдена. Откройте Grok кнопкой входа для проверки.",
        );
      this.state.phase = "waiting";
      const deadline = Date.now() + 240000,
        submittedAt = Date.now();
      let last = "",
        stableSince = 0,
        conversation: string | null = null;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        this.check(win);
        const url = new URL(win.webContents.getURL()),
          id = url.searchParams.get("conversation");
        if (conversation && id !== conversation)
          throw new Error("Чат Grok сменился во время анализа.");
        if (id) conversation = id;
        observed = await win.webContents.executeJavaScript(GROK_STATE_SCRIPT);
        if (observed!.blocked) throw new Error(observed!.blocked);
        if (
          Date.now() - submittedAt > 25000 &&
          !observed!.body.includes(context.requestId)
        )
          throw new Error(
            "Grok не подтвердил отправку запроса. Повторная отправка автоматически не выполняется.",
          );
        if (observed!.answer !== last) {
          last = observed!.answer;
          stableSince = Date.now();
        }
        if (
          observed!.copies > 0 &&
          !observed!.stop &&
          last &&
          Date.now() - stableSince >= 6000
        ) {
          let answer;
          try {
            answer = parseGrokAnswer(last, context);
          } catch {
            throw new Error(
              "Ответ Grok получен, но формат или адрес не совпадает с запросом. Откройте Grok для проверки; прежний результат сохранён.",
            );
          }
          this.check(win);
          const result = grokResultSchema.parse({
            target: context.target,
            handle: context.handle,
            requestId: context.requestId,
            observedAt: new Date().toISOString(),
            sourceUrl: win.webContents.getURL(),
            answer,
            rawText: last,
            attribution: "grok-browser",
          });
          this.state.phase = "complete";
          return result;
        }
      }
      throw new Error(
        "Grok не завершил ответ за 4 минуты. Прежний результат сохранён; Grok можно открыть кнопкой входа.",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Не удалось выполнить анализ Grok";
      this.state.phase = "error";
      this.state.error = message;
      throw new Error(message);
    } finally {
      if (this.window && !this.window.isDestroyed()) this.window.hide();
      this.busy = false;
    }
  }
}
