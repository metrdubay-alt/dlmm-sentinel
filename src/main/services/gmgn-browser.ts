import { GMGN_READ_SCRIPT } from "./gmgn-dom";
import { readConnection } from "./source-connection";
import { loadSourcePage } from "./source-navigation";
import { convertFees, FEE_RATES_URL } from "../../shared/analysis/fee-rates";
import { BrowserWindow, session } from "electron";
import {
  gmgnTargetSchema,
  parseGmgnCard,
  type GmgnTarget,
} from "../../shared/analysis/gmgn";

function allowed(url: string) {
  try {
    const u = new URL(url);
    return u.origin === "https://gmgn.ai" && !u.username && !u.password;
  } catch {
    return false;
  }
}
export class GmgnBrowser {
  private window: BrowserWindow | null = null;
  connection() {
    return readConnection(this.window, "gmgn");
  }
  async openAccount(parent: BrowserWindow) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      return true;
    }
    return this.open(null, parent);
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

  private initialized = false;
  async open(
    input: GmgnTarget | null,
    parent: BrowserWindow,
    background = false,
  ) {
    const target = input ? gmgnTargetSchema.parse(input) : null;
    if (!this.window || this.window.isDestroyed()) {
      const isolated = session.fromPartition("persist:sentinel-gmgn");
      if (!this.initialized) {
        isolated.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
        isolated.setPermissionCheckHandler(() => false);
        isolated.on("will-download", (event) => event.preventDefault());
        this.initialized = true;
      }
      const win = new BrowserWindow({
        parent,
        show: !background,
        width: 1280,
        height: 900,
        title: "GMGN — источник числовых данных",
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
      win.removeMenu();
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event, url) => {
        if (!allowed(url)) event.preventDefault();
      });
      win.webContents.on("will-redirect", (event, url) => {
        if (!allowed(url)) event.preventDefault();
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
    await loadSourcePage(
      this.window,
      target
        ? `https://gmgn.ai/${target.chain}/token/${target.address}`
        : "https://gmgn.ai/",
    );
    return true;
  }
  async capture(input: GmgnTarget) {
    const target = gmgnTargetSchema.parse(input),
      win = this.window;
    if (!win || win.isDestroyed())
      throw new Error("Сначала откройте карточку GMGN.");
    const url = win.webContents.getURL();
    if (!allowed(url)) throw new Error("Откройте карточку на gmgn.ai.");
    const selectPeriod = async (period: "5m" | "1h") => {
      if (win.isDestroyed() || win.webContents.getURL() !== url)
        throw new Error("Карточка изменилась при чтении.");
      const changed = await win.webContents.executeJavaScript(`(()=>{
        const groups=[...document.querySelectorAll('#GlobalScrollDomId [data-sentry-component="FilterGroup"]')].filter(g=>['5m','1h','24h'].every(p=>[...g.children].some(e=>e.firstElementChild?.textContent.trim()===p)));
        if(groups.length!==1)return false;
        const item=[...groups[0].children].find(e=>e.firstElementChild?.textContent.trim()===${JSON.stringify(period)});
        if(!item)return false;item.click();return true;
      })()`);
      if (changed) await new Promise((r) => setTimeout(r, 1000));
      return changed;
    };
    await selectPeriod("5m");
    const raw: unknown =
      await win.webContents.executeJavaScript(GMGN_READ_SCRIPT);
    if (win.isDestroyed() || win.webContents.getURL() !== url)
      throw new Error("Карточка изменилась при чтении. Повторите проверку.");
    const snapshot = parseGmgnCard(raw, target, new Date().toISOString());
    try {
      if (await selectPeriod("1h")) {
        const hourRaw: unknown =
          await win.webContents.executeJavaScript(GMGN_READ_SCRIPT);
        if (win.isDestroyed() || win.webContents.getURL() !== url)
          throw new Error("Карточка изменилась при чтении.");
        const hour = parseGmgnCard(hourRaw, target, new Date().toISOString());
        if (hour.volumePeriod === "1h")
          snapshot.metrics.volume1hUsd = hour.metrics.volume1hUsd;
      }
    } finally {
      if (!win.isDestroyed() && win.webContents.getURL() === url)
        await selectPeriod("5m");
    }
    if (!snapshot.nativeFees || snapshot.nativeFees.asset === "SOL")
      return snapshot;
    try {
      const response = await fetch(FEE_RATES_URL, {
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      });
      if (!response.ok) throw new Error("Rates unavailable");
      return convertFees(
        snapshot,
        await response.json(),
        new Date().toISOString(),
      );
    } catch {
      return snapshot;
    }
  }
  close() {
    this.window?.destroy();
    this.window = null;
  }
  async clear() {
    this.close();
    await session.fromPartition("persist:sentinel-gmgn").clearStorageData();
  }
}
