import { BrowserWindow, session } from "electron";
import type { Connection } from "../../shared/analysis/connections";
import type { FabriqFeeEvidence } from "../../shared/analysis/pool-fees";
import { FABRIQ_READ_SCRIPT, parseFabriqPoolFees } from "./fabriq-dom";
import { loadSourcePage } from "./source-navigation";

const trendingUrl = "https://fabriq.trade/trending";

function allowed(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.origin === "https://fabriq.trade" &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

export class FabriqBrowser {
  private window: BrowserWindow | null = null;
  private initialized = false;

  connection(): Connection {
    if (!this.window || this.window.isDestroyed())
      return {
        auth: "unknown",
        open: false,
        checkedAt: null,
        limit: null,
        challenge: false,
      };
    const challenge = /\/cdn-cgi\//.test(this.window.webContents.getURL());
    return {
      auth: "unknown",
      open: true,
      checkedAt: new Date().toISOString(),
      limit: null,
      challenge,
    };
  }

  async open(parent: BrowserWindow, background = false) {
    if (!this.window || this.window.isDestroyed()) {
      const isolated = session.fromPartition("persist:sentinel-fabriq");
      if (!this.initialized) {
        isolated.setPermissionRequestHandler((_wc, _p, callback) => callback(false));
        isolated.setPermissionCheckHandler(() => false);
        isolated.on("will-download", (event) => event.preventDefault());
        this.initialized = true;
      }
      const win = new BrowserWindow({
        parent,
        show: !background,
        width: 1280,
        height: 900,
        title: "Fabriq — комиссии пулов",
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
      win.webContents.on("will-attach-webview", (event) => event.preventDefault());
      win.on("closed", () => {
        if (this.window === win) this.window = null;
      });
    }
    if (background) this.window.hide();
    else this.window.show();
    if (
      this.window.webContents.getURL() === trendingUrl &&
      !this.window.webContents.isLoading()
    )
      return true;
    await loadSourcePage(this.window, trendingUrl);
    return true;
  }

  async capture(): Promise<FabriqFeeEvidence[]> {
    const win = this.window;
    if (!win || win.isDestroyed() || !allowed(win.webContents.getURL())) return [];
    try {
      const url = win.webContents.getURL();
      const raw: unknown = await win.webContents.executeJavaScript(FABRIQ_READ_SCRIPT);
      if (win.isDestroyed() || win.webContents.getURL() !== url) return [];
      return parseFabriqPoolFees(raw);
    } catch {
      return [];
    }
  }

  close() {
    this.window?.destroy();
    this.window = null;
  }

  async clear() {
    this.close();
    await session.fromPartition("persist:sentinel-fabriq").clearStorageData();
  }
}
