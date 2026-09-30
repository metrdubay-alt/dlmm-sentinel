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
 const editorReady=editors.length===1&&!editors[0].disabled&&!editors[0].readOnly&&editors[0].getAttribute('aria-disabled')!=='true';
 return {editorCount:editors.length,editorReady,value:editors[0]?.value??'',copies:copies.length,stop,answer:answer.slice(0,80001),body:body.slice(0,100000),blocked};
})()`;
// Match the observed send icon inside the editor's own composer; never a page-wide arrow.
export function grokSubmitScript(prompt: string, click = true) {
  return `(() => {
    const u=new URL(location.href);if(u.origin!=="https://x.com"||u.pathname!=="/i/grok")return 'changed';
    const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
    const editors=[...document.querySelectorAll('textarea')].filter(visible);
    if(editors.length!==1||editors[0].value!==${JSON.stringify(prompt)})return 'changed';
    const editor=editors[0];if(editor.disabled||editor.readOnly)return 'pending';
    const arrow='M12 3.59l7.457 7.45-1.414 1.42L13 7.41V21h-2V7.41l-5.043 5.05-1.414-1.42L12 3.59z';
    let root=editor.parentElement;
    for(let depth=0;root&&depth<6;depth++,root=root.parentElement){
      if(root===document.body)break;
      const buttons=[...root.querySelectorAll('button')].filter(visible).filter(b=>b.getAttribute('aria-label')==='Grok something'||[...b.querySelectorAll('svg path')].some(p=>p.getAttribute('d')===arrow));
      if(buttons.length>1)return 'ambiguous';
      if(buttons.length===1){
        const b=buttons[0];if(b.disabled||b.getAttribute('aria-disabled')==='true')return 'pending';
        if(${JSON.stringify(click)})b.click();return ${JSON.stringify(click ? "sent" : "ready")};
      }
    }
    return 'pending';
  })()`;
}

type State = {
  editorCount: number;
  editorReady: boolean;
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
  async run(
    config: WorkspaceConfig,
    parent: BrowserWindow,
    socialLinks: string[] = [],
  ) {
    if (this.busy) throw new Error("Анализ Grok уже выполняется.");
    this.busy = true;
    this.cancelled = false;
    const context: GrokContext = {
      socialLinks,
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
    let unsentPrompt: string | null = null;
    try {
      await super.openGrok(parent, true);
      const win = this.window!;
      let observed: State | undefined;
      const readyUntil = Date.now() + 30000;
      while (Date.now() < readyUntil) {
        this.check(win);
        observed = await win.webContents.executeJavaScript(GROK_STATE_SCRIPT);
        if (observed!.blocked) throw new Error(observed!.blocked);
        if (observed!.editorReady) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (!observed || observed.editorCount !== 1)
        throw new Error(
          "Поле Grok не найдено. Откройте Grok кнопкой входа для проверки.",
        );
      if (!observed.editorReady)
        throw new Error(
          "Поле Grok пока недоступно для ввода. Дождитесь загрузки Grok и повторите анализ.",
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
        `(() => {const u=new URL(location.href);if(u.origin!=="https://x.com"||u.pathname!=="/i/grok")return false;const nodes=[...document.querySelectorAll('textarea')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');if(nodes.length!==1||nodes[0].value.trim()||nodes[0].disabled||nodes[0].readOnly||nodes[0].getAttribute('aria-disabled')==='true')return false;const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;if(!setter)return false;setter.call(nodes[0],${JSON.stringify(prompt)});nodes[0].dispatchEvent(new Event('input',{bubbles:true}));return true;})()`,
      );
      if (!filled)
        throw new Error("Поле запроса Grok изменилось. Запрос не отправлен.");
      unsentPrompt = prompt;
      await new Promise((r) => setTimeout(r, 250));
      this.check(win);
      observed = await win.webContents.executeJavaScript(GROK_STATE_SCRIPT);
      if (observed!.value !== prompt)
        throw new Error(
          "Не удалось заполнить запрос Grok. Запрос не отправлен.",
        );
      // Poll only while no click occurred. A successful click or uncertain transport failure is never retried.
      let submitted = false;
      const sendUntil = Date.now() + 10000;
      while (Date.now() < sendUntil) {
        this.check(win);
        observed = await win.webContents.executeJavaScript(GROK_STATE_SCRIPT);
        if (observed!.blocked) throw new Error(observed!.blocked);
        const outcome = await win.webContents.executeJavaScript(
          grokSubmitScript(prompt),
        );
        if (outcome === "sent") {
          submitted = true;
          unsentPrompt = null;
          break;
        }
        if (outcome === "changed" || outcome === "ambiguous") break;
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!submitted)
        throw new Error(
          "Кнопка отправки Grok недоступна. Запрос не отправлен; повторите после загрузки Grok.",
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
          } catch (error) {
            const reason =
              error instanceof Error && !(error instanceof SyntaxError)
                ? error.message.slice(0, 350)
                : "Не удалось прочитать ответ Grok.";
            throw new Error(
              `${reason} Откройте Grok для проверки. Сохранённые результаты не изменены.`,
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
      if (unsentPrompt && this.window && !this.window.isDestroyed()) {
        // Remove only the exact draft inserted by this run; never touch a user's different draft.
        try {
          await this.window.webContents.executeJavaScript(`(()=>{
            const u=new URL(location.href);if(u.origin!=='https://x.com'||u.pathname!=='/i/grok')return;
            const nodes=[...document.querySelectorAll('textarea')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
            if(nodes.length!==1||nodes[0].value!==${JSON.stringify(unsentPrompt)})return;
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(nodes[0],'');nodes[0].dispatchEvent(new Event('input',{bubbles:true}));
          })()`);
        } catch {
          /* The source window may have closed. */
        }
      }
      if (this.window && !this.window.isDestroyed()) this.window.hide();
      this.busy = false;
    }
  }
}
