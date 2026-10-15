import { z } from "zod";
import type { GmgnSnapshot, GmgnTarget } from "../../shared/analysis/gmgn";

const rawRangeSchema = z
  .object({
    url: z.string().url().max(2048),
    tokenAddress: z.string().max(100),
    fullRange: z.literal(true),
    firstCompletedEpochSeconds: z.number().int().nonnegative(),
    latestCompletedEpochSeconds: z.number().int().nonnegative(),
    candleSeconds: z.number().int().positive().max(86400),
    volumeText: z.string().max(80),
  })
  .strict();

const money = (value: string) => {
  const match =
    /^\s*\$?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)([KMB])?\s*$/.exec(value);
  if (!match) return null;
  const parsed =
    Number(match[1].replaceAll(",", "")) *
    (match[2]
      ? ({ K: 1e3, M: 1e6, B: 1e9 } as Record<string, number>)[match[2]]
      : 1);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return {
    display: value.trim(),
    value: parsed,
    precision: match[2] ? ("rounded" as const) : ("display" as const),
  };
};

/** A complete GMGN chart measurement with verified token and time bounds. */
export function parseGmgnAllTimeVolume(
  raw: unknown,
  target: GmgnTarget,
  observedAt: string,
): GmgnSnapshot["chartRangeVolume"] | null {
  const range = rawRangeSchema.safeParse(raw);
  const observed = Date.parse(observedAt) / 1000;
  if (!range.success || !Number.isFinite(observed)) return null;
  const value = range.data;
  const expected = `/${target.chain}/token/${target.address}`;
  try {
    const url = new URL(value.url);
    if (
      url.origin !== "https://gmgn.ai" ||
      url.username ||
      url.password ||
      (target.chain === "sol"
        ? url.pathname !== expected || value.tokenAddress !== target.address
        : url.pathname.toLowerCase() !== expected.toLowerCase() ||
          value.tokenAddress.toLowerCase() !== target.address.toLowerCase())
    )
      return null;
  } catch {
    return null;
  }
  if (
    value.firstCompletedEpochSeconds >= value.latestCompletedEpochSeconds ||
    value.latestCompletedEpochSeconds + value.candleSeconds > observed
  )
    return null;
  const volumeUsd = money(value.volumeText);
  return volumeUsd
    ? {
        source: "GMGN chart",
        observedAt,
        firstCompletedEpochSeconds: value.firstCompletedEpochSeconds,
        latestCompletedEpochSeconds: value.latestCompletedEpochSeconds,
        candleSeconds: value.candleSeconds,
        volumeUsd,
      }
    : null;
}

/** Read the chart's own USD volume series. Completed daily bars plus today's
 * completed minute bars cover the full history without overlap. Never accept a
 * limited history unless an earlier request confirms its beginning. No chart
 * settings or selected ranges are changed. */
export function gmgnChartHistoryScript(target: GmgnTarget, observedAt: string) {
  return `(async()=>{
    const path=${JSON.stringify(`/${target.chain}/token/${target.address}`)};
    const symbol=${JSON.stringify(`${target.chain}/${target.address}/USD/`)};
    const observed=${JSON.stringify(Date.parse(observedAt))};
    const matches=()=>location.origin==='https://gmgn.ai'&&location.pathname===path;
    if(!matches()||!Number.isFinite(observed))return null;
    const frame=document.querySelector('iframe[id^="tradingview_"]');
    const feed=frame&&window[frame.id]?.datafeed;
    const ticker=frame?.contentWindow?.chartWidget?.getSymbol();
    if(!feed?.getBars||feed.firstBarBudgetScope!=null||typeof ticker!=='string'||!ticker.startsWith(symbol))return null;
    const read=(resolution,to,countBack)=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('GMGN chart history timeout')),12000);
      const finish=(value)=>{clearTimeout(timer);resolve(value)};
      try {feed.getBars({ticker},resolution,{from:0,to,countBack,firstDataRequest:false},
        (bars,meta)=>finish({bars,meta}),()=>finish(null));}catch{finish(null)}
    });
    const valid=(result,step)=>result&&Array.isArray(result.bars)&&result.bars.every((b,i,a)=>
      Number.isSafeInteger(b.time)&&b.time>=0&&b.time%step===0&&
      typeof b.volume==='number'&&Number.isFinite(b.volume)&&b.volume>=0&&
      (i===0||b.time>a[i-1].time));
    try {
      const end=Math.floor(observed/60000)*60000;
      const day=Math.floor(end/86400000)*86400000;
      const daily=await read('1D',Math.floor(observed/1000),2000);
      if(!valid(daily,86400000)||!daily.bars.length)return null;
      const first=daily.bars[0].time;
      const before=await read('1D',first/1000-1,1);
      if(!before||before.bars?.length!==0||before.meta?.noData!==true)return null;
      const minute=await read('1',Math.floor(observed/1000),1500);
      if(!valid(minute,60000)||!minute.bars.length)return null;
      // 1500 bars cover every possible minute of a UTC day; require a boundary
      // anchor as well, unless this token's entire history started today.
      if(first<day&&minute.bars[0].time>day)return null;
      const bars=[...daily.bars.filter(b=>b.time<day),...minute.bars.filter(b=>b.time>=day&&b.time<end)];
      if(!bars.length||!matches()||frame.contentWindow.chartWidget.getSymbol()!==ticker)return null;
      const volume=bars.reduce((sum,b)=>sum+b.volume,0);
      if(!Number.isFinite(volume))return null;
      const last=bars.at(-1);
      const lastStep=last.time<day?86400:60;
      return {url:location.href,tokenAddress:${JSON.stringify(target.address)},fullRange:true,
        firstCompletedEpochSeconds:bars[0].time/1000,latestCompletedEpochSeconds:last.time/1000,
        candleSeconds:lastStep,volumeText:'$'+volume.toFixed(8)};
    }catch{return null}
  })()`;
}

export async function readGmgnAllTimeVolume(
  execute: (script: string) => Promise<unknown>,
  target: GmgnTarget,
  observedAt: string,
) {
  try {
    return parseGmgnAllTimeVolume(
      await execute(gmgnChartHistoryScript(target, observedAt)),
      target,
      observedAt,
    );
  } catch {
    return null;
  }
}
