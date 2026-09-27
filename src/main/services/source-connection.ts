import type { BrowserWindow } from "electron";
import {
  connectionFromEvidence,
  unknownConnection,
  type SourceId,
  type ConnectionEvidence,
} from "../../shared/analysis/connections";
// Read rendered account controls only; never cookies, tokens, account identifiers or page globals.
export function connectionScript(source: SourceId) {
  return `(()=>{
 const source=${JSON.stringify(source)};
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
 const externalContent=e=>!!e.closest('article,pre,code,[data-testid="tweet"],[class*="message-bubble"],[class*="smartListItem"]');
 const nodes=s=>[...document.querySelectorAll(s)].filter(e=>visible(e)&&!externalContent(e));
 const label=e=>(e.getAttribute('aria-label')||e.innerText||'').trim();
 const controls=nodes('button,[role="button"],a');
 const signedOut=controls.some(e=>/^(sign in|log in|login|sign up \\/ log in|войти|вход|авторизация)$/i.test(label(e)))||nodes('input[autocomplete="current-password"]').length>0;
 const explicitAccount=controls.some(e=>/^(log out|logout|sign out|выйти|выход|my account|мой аккаунт)$/i.test(label(e)));
 const xAccount=nodes('[data-testid="SideNav_AccountSwitcher_Button"]').length>0;
 // Observed authenticated account controls, scoped to site chrome, never public token/profile content.
 const gmgnAccount=source==='gmgn'&&nodes('[data-sentry-component="Connect"] button').some(e=>!!e.querySelector('[data-icon="IconWallet16pxRegular"]')&&!!e.querySelector('[data-icon*="bal"],[data-icon="IconRobinhoodeth16pxS"],[data-icon="IconBaseeth10016pxS"]'));
 const moniAccount=source==='moni'&&nodes('a[class*="sideNavigation_link"][aria-label="Profile"]').length>0&&nodes('a[class*="paymentStatus_statusLink"]').length>0;
 const notice=nodes('[role="alert"],[role="alertdialog"],[role="dialog"],[class*="quota"],[class*="Quota"],[class*="limit"],[class*="Limit"]').map(e=>(e.innerText||'').slice(0,1200)).join('\\n').slice(0,8000);
 const challenge=nodes('iframe[title]').some(e=>/captcha|challenge/i.test(e.title))||/verify.{0,30}human|подтвердите.{0,30}человек/i.test(notice);
 return {signedIn:explicitAccount||gmgnAccount||moniAccount||((source==='x'||source==='grok')&&xAccount),signedOut,notice,challenge};
})()`;
}
export async function readConnection(
  win: BrowserWindow | null,
  source: SourceId,
) {
  if (!win || win.isDestroyed()) return unknownConnection();
  const url = win.webContents.getURL();
  const allowed =
    source === "x" || source === "grok"
      ? ["https://x.com"]
      : source === "gmgn"
        ? ["https://gmgn.ai"]
        : ["https://app.moni.ai", "https://profile.moni.ai"];
  try {
    if (!allowed.includes(new URL(url).origin))
      return { ...unknownConnection(), open: true };
    const result = (await Promise.race([
      win.webContents.executeJavaScript(connectionScript(source)),
      new Promise<never>((_, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), 2000);
        t.unref();
      }),
    ])) as ConnectionEvidence;
    if (win.isDestroyed() || win.webContents.getURL() !== url)
      return unknownConnection();
    return connectionFromEvidence(result);
  } catch {
    return { ...unknownConnection(), open: !win.isDestroyed() };
  }
}
