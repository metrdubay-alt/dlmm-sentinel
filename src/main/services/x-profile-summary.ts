import { z } from "zod";
import {
  xFollowingOverlapSchema,
  type XFollowingOverlap,
} from "../../shared/analysis/x-following-overlap";

const summarySchema = z.object({
  url: z.string(),
  identity: z.string(),
  template: z.string().max(1000),
  zero: z.boolean(),
});
export function parseXProfileSummary(
  raw: unknown,
  target: string,
  followingTotal: string,
  observedAt: string,
): XFollowingOverlap | null {
  const parsed = summarySchema.safeParse(raw);
  if (!parsed.success) return null;
  const v = parsed.data;
  const handle = target.toLowerCase();
  try {
    const u = new URL(v.url);
    if (
      u.origin !== "https://x.com" ||
      u.pathname.toLowerCase().replace(/\/$/, "") !== "/" + handle
    )
      return null;
  } catch {
    return null;
  }
  if (
    !(v.identity.match(/@[a-z0-9_]{1,15}/gi) || []).some(
      (h) => h.toLowerCase() === "@" + handle,
    )
  )
    return null;
  const count = /^(\d{1,3}(?:[, \u00a0\u202f]\d{3})+|\d+)\s+/.exec(
    followingTotal.trim(),
  );
  if (!count) return null;
  const total = Number(count[1].replace(/[, \u00a0\u202f]/g, ""));
  const template = v.template.replace(/\s+/g, " ").trim();
  let matched: number;
  if (v.zero && !template) matched = 0;
  else {
    if (v.zero) return null;
    const en =
      /^Followed by (§(?:, §)*(?:,? and §)?)(?:,? and (\d+) others? you follow| you follow)?$/i.exec(
        template,
      );
    const ru =
      /^В читаемых у (§(?:, §)*(?: и §)?)(?: и ещ[её] (\d+) пользователей)?(?:, которых вы читаете)?$/i.exec(
        template,
      );
    const match = en || ru;
    if (!match) return null;
    matched = (match[1].match(/§/g) || []).length + Number(match[2] || 0);
  }
  const result = xFollowingOverlapSchema.safeParse({
    state: "complete",
    targetHandle: handle,
    sourceUrl: v.url,
    observedAt,
    followingTotal: total,
    matchedFollowing: matched,
  });
  return result.success ? result.data : null;
}

/** Only the profile's dedicated mutual-follow link, never tweet text or recommendations. */
export function xProfileSummaryScript(handle: string) {
  return `(() => new Promise(resolve=>{
 const expected=${JSON.stringify(handle.toLowerCase())};const deadline=Date.now()+5000;
 const text=e=>(e?.innerText||e?.textContent||'').trim();
 const zero=/^(?:Not followed by anyone you(?:'|’)re following|Нет в читаемых у пользователей, которых читаете вы|Никто из тех, на кого вы подписаны, не подписан)\\.?$/i;
 const poll=()=>{
  if(location.origin!=='https://x.com'||location.pathname.toLowerCase().replace(/\\/$/,'')!=='/'+expected)return resolve(null);
  const root=document.querySelector('[data-testid="primaryColumn"]')||document.querySelector('main');
  const identity=text(root?.querySelector('[data-testid="UserName"]'));
  const confirmed=(identity.match(/@[a-z0-9_]{1,15}/gi)||[]).some(h=>h.toLowerCase()==='@'+expected);
  if(root&&confirmed){
   const link=[...root.querySelectorAll('a[href]')].find(a=>a.getAttribute('href')?.toLowerCase()==='/'+expected+'/followers_you_follow'&&!a.closest('article'));
   if(link){
    const label=[...link.querySelectorAll('[dir]')].find(e=>/^(Followed by |В читаемых у )/i.test(text(e)));
    if(label){const template=[...label.childNodes].map(n=>n.nodeType===3?n.textContent:n.nodeType===1&&n.tagName==='SPAN'&&text(n)?'§':'').join('');return resolve({url:location.href,identity,template,zero:false});}
   }
   const noMatches=[...root.querySelectorAll('div,span')].some(e=>!e.closest('article')&&!e.querySelector('article')&&zero.test(text(e)));
   if(noMatches)return resolve({url:location.href,identity,template:'',zero:true});
  }
  if(Date.now()>=deadline)return resolve(null);setTimeout(poll,100);
 };poll();
 }))()`;
}

export function xOwnProfileReadyScript(handle: string) {
  return `(() => new Promise((resolve,reject)=>{const expected=${JSON.stringify(handle.toLowerCase())};const deadline=Date.now()+8000;const poll=()=>{
 if(location.pathname.toLowerCase().replace(/\\/$/,'')!=='/'+expected)return reject(Error('Профиль X изменился.'));
 const root=document.querySelector('[data-testid="primaryColumn"]')||document.querySelector('main');
 const identity=root?.querySelector('[data-testid="UserName"]')?.innerText||'';
 const count=[...(root?.querySelectorAll('a[href]')||[])].find(a=>a.getAttribute('href')?.toLowerCase()==='/'+expected+'/following');
 if((identity.match(/@[a-z0-9_]{1,15}/gi)||[]).some(h=>h.toLowerCase()==='@'+expected)&&count?.innerText.trim())return resolve(true);
 if(Date.now()>=deadline)return reject(Error('X не загрузил счётчик подписок.'));setTimeout(poll,100);
 };poll();}))()`;
}
