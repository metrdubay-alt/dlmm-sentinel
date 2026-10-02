import { z } from "zod";
import type { GmgnTarget } from "../../shared/analysis/gmgn";
import {
  minuteVolumeSnapshot,
  parseSolQuote,
} from "../../shared/analysis/minute-volume";
/** Reuses the token chart request within the user's GMGN session; no session data leaves this page. */
export function minuteReadScript(address: string) {
  return `(async()=>{
  const path=${JSON.stringify("/api/v1/token_mcap_candles/sol/" + address)};
  const tokenPath=${JSON.stringify("/sol/token/" + address)};
  if(location.origin!=='https://gmgn.ai'||location.pathname!==tokenPath)throw Error('Token changed');
  const match=performance.getEntriesByType('resource').map(e=>e.name).reverse().find(name=>{try{const u=new URL(name);return u.origin===location.origin&&u.pathname===path}catch{return false}});
  const url=new URL(match||path,location.origin);
  for(const key of ['from','to','from_timestamp','to_timestamp','before_timestamp'])url.searchParams.delete(key);
  url.searchParams.set('resolution','1m');url.searchParams.set('limit','10');
  const response=await fetch(url.href,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Minute candles unavailable');
  const raw=await response.json();
  if(location.pathname!==tokenPath)throw Error('Token changed');
  return raw;
 })()`;
}
export async function captureMinuteVolumes(
  target: GmgnTarget,
  read: (script: string) => Promise<unknown>,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  if (target.chain !== "sol") return undefined;
  const timestamp = now();
  const [raw, rate] = await Promise.all([
    read(minuteReadScript(target.address)).catch(() => null),
    fetcher("https://api.exchange.coinbase.com/products/SOL-USD/ticker", {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);
  const token = z
    .object({
      data: z.object({
        _debug_tpool: z.object({ base_address: z.string() }).optional(),
      }),
    })
    .safeParse(raw);
  const address = token.success
    ? token.data.data._debug_tpool?.base_address
    : undefined;
  return minuteVolumeSnapshot(
    address && address !== target.address ? null : raw,
    timestamp,
    parseSolQuote(rate, timestamp),
  );
}
