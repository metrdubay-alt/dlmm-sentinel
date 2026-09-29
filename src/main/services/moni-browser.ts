import { readConnection } from "./source-connection";
import { loadSourcePage } from "./source-navigation";
import { BrowserWindow, session } from "electron";
import {
  allowedMoniNavigation,
  MoniReadError,
  moniHandleSchema,
  parseMoniCard,
  parseMoniProfileResponse,
  type MoniSnapshot,
} from "../../shared/analysis/moni";

// Fixed read-only DOM extraction. No cookies, network requests, page globals or scripts supplied by the renderer.
export const MONI_READ_SCRIPT = `(() => {
  const one = selector => { const nodes = document.querySelectorAll(selector); return nodes.length === 1 ? nodes[0] : null; };
  const text = selector => one(selector)?.innerText || '';
  return {
    url: location.href,
    notFound: [...document.querySelectorAll('[class*="accountPage_searchNotFoundContainer"] [class*="searchNotFound_title"]')].some(e=>e.getClientRects().length>0 && /^not found$/i.test(e.textContent.trim())),
    profileHref: one('[class*="accountHeaderBlock_links"] a[href^="https://x.com/"]')?.href || '',
    scoreText: text('[class*="scoreBlock_scoreNumber"]'),
    smartsText: text('[class*="smartsListHeader_smartFollowersCount"]'),
    smartHrefs: [...document.querySelectorAll('a[class*="smartListItem_link"]')].slice(0,1000).map(a => a.getAttribute('href') || '')
  };
})()`;

export class MoniBrowser {
  private window: BrowserWindow | null = null;
  private observed = new Map<string, MoniSnapshot>();
  private observePublicProfile(win: BrowserWindow) {
    const debuggerApi = win.webContents.debugger;
    const requests = new Map<string, string>();
    try {
      debuggerApi.attach("1.3");
      void debuggerApi.sendCommand("Network.enable").catch(() => undefined);
      debuggerApi.on("message", async (_event, method, params) => {
        if (method === "Network.responseReceived") {
          try {
            const url = new URL(params.response.url);
            const match = /^\/api\/observed\/([a-zA-Z0-9_]{1,15})\/$/.exec(
              url.pathname,
            );
            if (
              url.origin === "https://twitter-bot.getmoni.io" &&
              match &&
              params.response.status === 200
            )
              requests.set(params.requestId, match[1].toLowerCase());
          } catch {
            /* Ignore unrelated requests. */
          }
        }
        if (method === "Network.loadingFailed")
          requests.delete(params.requestId);
        if (method !== "Network.loadingFinished") return;
        const handle = requests.get(params.requestId);
        if (!handle) return;
        requests.delete(params.requestId);
        try {
          const response = await debuggerApi.sendCommand(
            "Network.getResponseBody",
            { requestId: params.requestId },
          );
          if (response.base64Encoded || response.body.length > 2000000) return;
          const snapshot = parseMoniProfileResponse(
            JSON.parse(response.body),
            handle,
            new Date().toISOString(),
          );
          this.observed.set(handle, snapshot);
          if (this.observed.size > 20)
            this.observed.delete(this.observed.keys().next().value!);
        } catch {
          /* DOM reading remains available if the profile response is unavailable. */
        }
      });
    } catch {
      /* DOM-only mode if the debugging transport is occupied. */
    }
  }
  connection() {
    return readConnection(this.window, "moni");
  }
  async openAccount(parent: BrowserWindow) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      return true;
    }
    return this.open("getmoni_io", parent);
  }
  isOpen(url: string) {
    if (!this.window || this.window.isDestroyed()) return false;
    try {
      const actual = new URL(this.window.webContents.getURL());
      const expected = new URL(url);
      return (
        actual.origin === expected.origin &&
        actual.pathname.toLowerCase() === expected.pathname.toLowerCase()
      );
    } catch {
      return false;
    }
  }

  private busy = false;
  async open(requested: string, parent: BrowserWindow, background = false) {
    const handle = moniHandleSchema.parse(requested);
    this.observed.delete(handle);
    if (this.busy) throw new Error("Дождитесь текущей проверки Moni.");
    this.busy = true;
    try {
      if (!this.window || this.window.isDestroyed()) {
        const isolated = session.fromPartition("persist:sentinel-moni");
        isolated.setPermissionRequestHandler((_wc, _p, done) => done(false));
        isolated.setPermissionCheckHandler(() => false);
        isolated.on("will-download", (event) => event.preventDefault());
        const win = new BrowserWindow({
          parent,
          show: !background,
          width: 1200,
          height: 850,
          title: "GetMoni — источник данных",
          webPreferences: {
            session: isolated,
            backgroundThrottling: false,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            webviewTag: false,
          },
        });
        this.window = win;
        this.observePublicProfile(win);
        win.removeMenu();
        win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        win.webContents.on("will-navigate", (event, url) => {
          if (!allowedMoniNavigation(url)) event.preventDefault();
        });
        win.webContents.on("will-redirect", (event, url) => {
          if (!allowedMoniNavigation(url)) event.preventDefault();
        });
        win.webContents.on("will-attach-webview", (event) =>
          event.preventDefault(),
        );
        win.on("closed", () => {
          if (this.window === win) this.window = null;
        });
      }
      if (background) this.window.hide();
      else this.window.show();
      await loadSourcePage(this.window, `https://app.moni.ai/${handle}`);
      return true;
    } finally {
      this.busy = false;
    }
  }
  async capture(requested: string) {
    const win = this.window;
    if (this.busy) throw new Error("Дождитесь загрузки Moni.");
    if (!win || win.isDestroyed())
      throw new Error("Сначала откройте окно Moni и войдите в аккаунт.");
    this.busy = true;
    try {
      const before = win.webContents.getURL();
      if (!allowedMoniNavigation(before))
        throw new Error("Откройте карточку на app.moni.ai.");
      const raw: unknown =
        await win.webContents.executeJavaScript(MONI_READ_SCRIPT);
      if (win.isDestroyed() || win.webContents.getURL() !== before)
        throw new Error(
          "Страница изменилась во время чтения. Повторите проверку.",
        );
      try {
        return parseMoniCard(raw, requested, new Date().toISOString());
      } catch (error) {
        if (error instanceof MoniReadError) throw error;
        const connection = await this.connection();
        if (connection.limit)
          throw new MoniReadError("limit", connection.limit);
        if (connection.auth === "signed-out")
          throw new MoniReadError(
            "signed-out",
            "GetMoni: требуется вход в аккаунт.",
          );
        const handle = moniHandleSchema.parse(requested),
          snapshot = this.observed.get(handle);
        const url = new URL(before);
        if (
          url.origin === "https://app.moni.ai" &&
          url.pathname.toLowerCase().replace(/\/$/, "") === `/${handle}` &&
          snapshot &&
          Date.now() - Date.parse(snapshot.observedAt) < 120000
        )
          return snapshot;
        throw error;
      }
    } finally {
      this.busy = false;
    }
  }
  close() {
    this.observed.clear();
    this.window?.destroy();
    this.window = null;
  }
  async clear() {
    this.close();
    await session.fromPartition("persist:sentinel-moni").clearStorageData();
  }
}
