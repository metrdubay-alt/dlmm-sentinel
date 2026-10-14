import { z } from "zod";
import type { FabriqFeeEvidence } from "../../shared/analysis/pool-fees";

const address = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const rawRow = z.object({
  href: z.string().url().max(2048),
  label: z.string().max(160),
  fees5mText: z.string().max(80),
});

function fee(text: string) {
  const match = /^\s*\$([\d,]+(?:\.\d{1,2})?)\s*$/.exec(text);
  if (!match) return null;
  const value = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function poolAddress(href: string) {
  try {
    const url = new URL(href);
    if (url.origin !== "https://fabriq.trade") return null;
    const match = /^\/pool\/([^/?#]+)\/?$/.exec(url.pathname);
    return match?.[1] && address.test(match[1]) ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Accepts only an exact Fabriq pool URL and an unambiguous, full USD value.
 * Token routes, compact amounts and conflicting duplicate rows are deliberately
 * ignored so a pool never receives another pool's commission signal.
 */
export function parseFabriqPoolFees(raw: unknown): FabriqFeeEvidence[] {
  const rows = z.array(rawRow).safeParse(raw);
  if (!rows.success) return [];
  const values = new Map<string, number>();
  const conflicting = new Set<string>();
  for (const row of rows.data) {
    const key = poolAddress(row.href);
    const value = fee(row.fees5mText);
    if (!key || value === null || conflicting.has(key)) continue;
    const previous = values.get(key);
    if (previous !== undefined && previous !== value) {
      values.delete(key);
      conflicting.add(key);
    } else values.set(key, value);
  }
  return [...values].map(([address, fees5mUsd]) => ({ address, fees5mUsd }));
}

export const FABRIQ_READ_SCRIPT = `(() => {
  const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility==='visible';
  const text=e=>(e?.innerText||e?.textContent||'').trim();
  const roots=[...document.querySelectorAll('table,[role="table"],[role="grid"]')].filter(visible);
  const result=[];
  for(const root of roots){
    const header=[...root.querySelectorAll('thead th,[role="columnheader"]')].filter(visible);
    const index=header.findIndex(e=>/^5m\\s*Fees$/i.test(text(e)));
    if(index<0) continue;
    const rows=[...root.querySelectorAll('tbody tr,[role="row"]')].filter(row=>visible(row)&&row.querySelector('td,[role="cell"]'));
    for(const row of rows){
      const cells=[...row.querySelectorAll('td,[role="cell"]')].filter(visible);
      const links=[...row.querySelectorAll('a[href*="/pool/"]')].filter(visible);
      if(cells[index]&&links.length===1) result.push({href:links[0].href,label:text(links[0]),fees5mText:text(cells[index])});
    }
  }
  return result.slice(0,500);
})()`;
