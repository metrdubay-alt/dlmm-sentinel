import { readConnection } from "./source-connection";
import { loadSourcePage } from "./source-navigation";
import { convertFees, FEE_RATES_URL } from "../../shared/analysis/fee-rates";
import { BrowserWindow, session } from "electron";
import {
  gmgnTargetSchema,
  parseGmgnCard,
  type GmgnTarget,
} from "../../shared/analysis/gmgn";

export const GMGN_READ_SCRIPT = `(() => {
  const root=document.querySelector('#GlobalScrollDomId');
  if(!root) throw new Error('Карточка GMGN ещё не загрузилась.');
  const clean=e=>(e?.innerText||'').replace(/[\\uE000-\\uF8FF]/g,'').trim();
  const info={};
  for(const label of ['Top 10','Holders','Snipers','DEV','Total Fees']) {
    const rows=[...root.querySelectorAll('[data-sentry-component="InfoItem"]')].filter(e=>clean(e.querySelector('.info-item-title'))===label);
    info[label]=rows.length===1?clean(rows[0].querySelector('.info-item-value')):'';
  }
  const risk={};
  for(const label of ['Bundler','Phishing']) {
    const labels=[...root.querySelectorAll('.item-title')].filter(e=>clean(e)===label);
    risk[label]=labels.length===1?clean(labels[0].parentElement?.parentElement?.querySelector('.item-value')):'';
  }
  const pool={};
  for(const label of ['Market cap','Token created','Pool created','Total liq']) {
    const rows=[...root.querySelectorAll('[data-sentry-component="PoolItem"]')].filter(e=>clean(e.firstElementChild)===label);
    pool[label]=rows.length===1?clean(rows[0].lastElementChild):'';
  }
  const volLabels=[...root.querySelectorAll('span')].filter(e=>clean(e)==='Vol');
  const periodLabels=[...root.querySelectorAll('span')].filter(e=>['1m','5m','1h','24h'].includes(clean(e))&&e.parentElement?.classList.contains('bg-card-100'));
  const fees=[...root.querySelectorAll('[data-sentry-component="InfoItem"]')].filter(e=>clean(e.querySelector('.info-item-title'))==='Total Fees');
  const eyes=[...root.querySelectorAll('[data-sentry-component="BaseInfoBar"] [data-icon="IconDisplay16pxRegular"]')].filter(e=>e.getClientRects().length>0&&getComputedStyle(e).visibility==='visible');
  const panel=root.querySelector('[id$="panel-holders"]');
  const activePanel=panel&&panel.getClientRects().length>0;
  const holderCells=activePanel?[...panel.querySelectorAll('[data-testid="table-cell-holder"]')]:[];
  const holders=holderCells.slice(0,200).map(cell=>{
    const row=cell.parentElement;
    const links=[...cell.querySelectorAll('a[href^="/sol/address/"],a[href^="/bsc/address/"],a[href^="/eth/address/"],a[href^="/base/address/"],a[href^="/robinhood/address/"]')];
    const addresses=[...new Set(links.map(a=>a.getAttribute('href').split('/').pop()))];
    return {address:addresses.length===1?addresses[0]:'', tags:[...cell.querySelectorAll('[data-testid^="user-tag-"]')].map(e=>e.getAttribute('data-testid').replace('user-tag-','')),
      unrealized:clean(row?.querySelector('[data-testid="table-cell-unrealized"]')),
      remaining:clean(row?.querySelector('[data-testid="table-cell-owned"]'))};
  });
  return {url:location.href,tokenLinks:[...root.querySelectorAll('a[href*="solscan.io/token/"],a[href*="bscscan.com/token/"],a[href*="etherscan.io/token/"],a[href*="basescan.org/token/"],a[href*="robin.etherscan.io/token/"]')].map(e=>e.href),info,risk,pool,
    poolLinks:[...root.querySelectorAll('[data-sentry-component="PoolInfo"] a[href]')].map(e=>e.href).slice(0,100),
    watchersText:eyes.length===1?clean(eyes[0].nextElementSibling):'',
    holders,holdersState:!activePanel?'unavailable':holderCells.length?'partial':clean(panel).includes('No Data')?'empty':'unavailable',
    tooltips:[...document.querySelectorAll('[role="tooltip"]')].filter(e=>e.getClientRects().length>0&&getComputedStyle(e).visibility==='visible'&&getComputedStyle(e).opacity!=='0').map(clean).slice(0,20),
    volumeText:volLabels.length===1?clean(volLabels[0].nextElementSibling):'',volumePeriod:periodLabels.length===1?clean(periodLabels[0]):'',
    feeIcon:fees.length===1?(fees[0].querySelector('[data-icon]')?.getAttribute('data-icon')||''):''};
})()`;
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
