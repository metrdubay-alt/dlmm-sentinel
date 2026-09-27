import { readConnection } from "./source-connection";
import { loadSourcePage } from "./source-navigation";
import { BrowserWindow, session } from "electron";
import { allowedX, parseXProfile } from "../../shared/analysis/x-browser";
import { moniHandleSchema } from "../../shared/analysis/moni";
export const X_READ_SCRIPT = `(() => {
 const root=document.querySelector('[data-testid="primaryColumn"]')||document.querySelector('main');
 if(!root)throw new Error('X ещё не загрузился.');
 const text=e=>(e?.innerText||'').trim();
 const identity=text(root.querySelector('[data-testid="UserName"]'));
 const handle=location.pathname.split('/')[1];
 const links=[...root.querySelectorAll('a[href]')];
 const count=suffix=>text(links.find(a=>a.getAttribute('href')?.toLowerCase()===('/'+handle+suffix).toLowerCase()));
 const header=root.querySelector('[data-testid="UserProfileHeader_Items"]');
 const posts=[...root.querySelectorAll('article[data-testid="tweet"]')].slice(0,100).flatMap(article=>{
  const authorLink=article.querySelector('[data-testid="User-Name"] a[href]');
  const author=authorLink?.getAttribute('href')?.split('/')[1]||'';
  const time=article.querySelector('time');const link=time?.closest('a');
  if(!author||!link)return [];
  return [{url:link.href,author,text:text(article.querySelector('[data-testid="tweetText"]')).slice(0,12000),publishedAt:time.getAttribute('datetime')}];
 });
 const body=text(root);const unavailable=['This account doesn’t exist',"This account doesn't exist",'Account suspended','Такой учетной записи не существует','Такой учётной записи не существует','Учётная запись заблокирована'].find(s=>body.includes(s))||'';
 return {url:location.href,identity,bio:text(root.querySelector('[data-testid="UserDescription"]')),website:text(header?.querySelector('a[href^="https://t.co/"]')),
 joined:text(header?.querySelector('[data-testid="UserJoinDate"]')),followers:count('/verified_followers')||count('/followers'),following:count('/following'),posts,unavailableText:unavailable};
})()`;
export class XBrowser {
  protected window: BrowserWindow | null = null;
  connection() {
    return readConnection(this.window, "x");
  }
  async openAccount(parent: BrowserWindow) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      return true;
    }
    return this.openUrl("https://x.com/home", parent, false);
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

  async open(requested: string, parent: BrowserWindow, background = false) {
    const handle = moniHandleSchema.parse(requested);
    return this.openUrl(`https://x.com/${handle}`, parent, background);
  }
  async openGrok(parent: BrowserWindow, background = false) {
    return this.openUrl("https://x.com/i/grok", parent, background);
  }
  private async openUrl(
    url: string,
    parent: BrowserWindow,
    background: boolean,
  ) {
    if (!this.window || this.window.isDestroyed()) {
      const isolated = session.fromPartition("persist:sentinel-x");
      isolated.setPermissionRequestHandler((_w, _p, cb) => cb(false));
      isolated.setPermissionCheckHandler(() => false);
      isolated.on("will-download", (e) => e.preventDefault());
      const win = new BrowserWindow({
        parent,
        width: 1200,
        height: 850,
        show: !background,
        title: "X — источник социальных данных",
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
      win.webContents.on("will-navigate", (e, url) => {
        if (!allowedX(url)) e.preventDefault();
      });
      win.webContents.on("will-redirect", (e, url) => {
        if (!allowedX(url)) e.preventDefault();
      });
      win.webContents.on("will-attach-webview", (e) => e.preventDefault());
      win.on("closed", () => {
        if (this.window === win) this.window = null;
      });
    }
    if (background) this.window.hide();
    else this.window.show();
    await loadSourcePage(this.window, url);
    return true;
  }
  async capture(requested: string) {
    const win = this.window;
    if (!win || win.isDestroyed())
      throw new Error("Сначала откройте X и войдите в аккаунт.");
    const before = win.webContents.getURL();
    if (!allowedX(before)) throw new Error("Откройте профиль на x.com.");
    const raw: unknown = await win.webContents.executeJavaScript(X_READ_SCRIPT);
    if (win.isDestroyed() || win.webContents.getURL() !== before)
      throw new Error("Профиль изменился во время чтения.");
    return parseXProfile(raw, requested, new Date().toISOString());
  }
  close() {
    this.window?.destroy();
    this.window = null;
  }
  async clear() {
    this.close();
    await session.fromPartition("persist:sentinel-x").clearStorageData();
  }
}
