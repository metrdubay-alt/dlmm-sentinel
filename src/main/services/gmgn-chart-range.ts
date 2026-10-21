import { z } from "zod";
import type { GmgnSnapshot, GmgnTarget } from "../../shared/analysis/gmgn";

const candleResolutions = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14_400,
  "1d": 86_400,
} as const;
type CandleResolution = keyof typeof candleResolutions;
const maxCandles = 500;
const gmgnSessionParameterNames = [
  "device_id",
  "fp_did",
  "client_id",
  "from_app",
  "app_ver",
  "tz_name",
  "tz_offset",
  "app_lang",
  "os",
] as const;
type GmgnSessionParameterName = (typeof gmgnSessionParameterNames)[number];

export function gmgnSessionQueryParameters(resourceNames: string[]) {
  for (const resourceName of [...resourceNames].reverse()) {
    try {
      const url = new URL(resourceName);
      if (
        url.origin !== "https://gmgn.ai" ||
        url.username ||
        url.password ||
        !/^\/(?:api|vas)\//.test(url.pathname)
      )
        continue;
      const parameters: Partial<Record<GmgnSessionParameterName, string>> = {};
      for (const name of gmgnSessionParameterNames) {
        const value = url.searchParams.get(name);
        if (value) parameters[name] = value;
      }
      if (Object.keys(parameters).length) return parameters;
    } catch {
      // Browser resource entries may contain non-URL names.
    }
  }
  return {};
}

const rawCandleRangeSchema = z
  .object({
    url: z.string().url().max(2048),
    tokenAddress: z.string().max(100),
    resolution: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]),
    limit: z.literal(maxCandles),
    data: z
      .object({
        _debug_tpool: z.object({ base_address: z.string().max(100) }).nullish(),
        list: z
          .array(
            z.object({
              time: z.number().int().positive(),
              volume: z.union([
                z.number().finite(),
                z.string().regex(/^\d+(?:\.\d+)?$/),
              ]),
            }),
          )
          .max(maxCandles),
      }),
  })
  .strict();

function isCanonicalTokenUrl(
  urlText: string,
  tokenAddress: string,
  target: GmgnTarget,
) {
  const expected = `/${target.chain}/token/${target.address}`;
  try {
    const url = new URL(urlText);
    return (
      url.origin === "https://gmgn.ai" &&
      !url.username &&
      !url.password &&
      (target.chain === "sol"
        ? url.pathname === expected && tokenAddress === target.address
        : url.pathname.toLowerCase() === expected.toLowerCase() &&
          tokenAddress.toLowerCase() === target.address.toLowerCase())
    );
  } catch {
    return false;
  }
}

/**
 * Reads the same candle feed the GMGN chart uses. A range that fills the
 * endpoint's limit might omit older history, so it is deliberately rejected.
 */
export function parseGmgnAllTimeCandleVolume(
  raw: unknown,
  target: GmgnTarget,
  observedAt: string,
): GmgnSnapshot["chartRangeVolume"] | null {
  const parsed = rawCandleRangeSchema.safeParse(raw);
  const observed = Date.parse(observedAt) / 1000;
  if (!parsed.success || !Number.isFinite(observed)) return null;
  const value = parsed.data;
  if (
    !isCanonicalTokenUrl(value.url, value.tokenAddress, target) ||
    (value.data._debug_tpool?.base_address &&
      (target.chain === "sol"
        ? value.data._debug_tpool.base_address !== target.address
        : value.data._debug_tpool.base_address.toLowerCase() !==
          target.address.toLowerCase())) ||
    value.data.list.length === 0 ||
    value.data.list.length >= value.limit
  )
    return null;

  const candleSeconds = candleResolutions[value.resolution];
  const completedBefore = Math.floor(observed / candleSeconds) * candleSeconds;
  const candles = new Map<number, number>();
  for (const candle of value.data.list) {
    const timestamp = candle.time / 1000;
    const volume = Number(candle.volume);
    if (
      !Number.isInteger(timestamp) ||
      timestamp % candleSeconds !== 0 ||
      !Number.isFinite(volume) ||
      volume < 0 ||
      candles.has(timestamp)
    )
      return null;
    if (timestamp >= completedBefore) continue;
    candles.set(timestamp, volume);
  }
  if (candles.size === 0) return null;
  const firstCompletedEpochSeconds = Math.min(...candles.keys());
  const latestCompletedEpochSeconds = Math.max(...candles.keys());
  const total = [...candles.values()].reduce((sum, volume) => sum + volume, 0);
  if (!Number.isFinite(total) || total < 0) return null;
  return {
    source: "GMGN chart",
    observedAt,
    firstCompletedEpochSeconds,
    latestCompletedEpochSeconds,
    candleSeconds,
    volumeUsd: {
      display: `$${total.toLocaleString("en-US", {
        maximumFractionDigits: 2,
      })}`,
      value: total,
      precision: "display",
    },
  };
}

export function gmgnAllTimeCandlesScript(
  target: GmgnTarget,
  resolution: CandleResolution,
  sessionParameters: Partial<Record<GmgnSessionParameterName, string>> = {},
) {
  return `(async()=>{
  const path=${JSON.stringify("/api/v1/token_mcap_candles/" + target.chain + "/" + target.address)};
  const tokenPath=${JSON.stringify("/" + target.chain + "/token/" + target.address)};
  if(location.origin!=="https://gmgn.ai"||location.pathname!==tokenPath)throw Error('Token changed');
  const resourceNames=performance.getEntriesByType('resource').map(e=>e.name);
  const match=[...resourceNames].reverse().find(name=>{try{const u=new URL(name);return u.origin===location.origin&&u.pathname===path}catch{return false}});
  const url=new URL(match||path,location.origin);
  const sessionKeys=${JSON.stringify(gmgnSessionParameterNames)};
  const capturedSessionParameters=${JSON.stringify(sessionParameters)};
  const sessionSource=[...resourceNames].reverse().map(name=>{try{return new URL(name)}catch{return null}}).find(u=>u&&u.origin===location.origin&&/^\\/(?:api|vas)\\//.test(u.pathname)&&sessionKeys.some(key=>u.searchParams.has(key)));
  for(const key of ['from','to','from_timestamp','to_timestamp','before_timestamp','limit','resolution',...sessionKeys])url.searchParams.delete(key);
  for(const key of sessionKeys){const value=capturedSessionParameters[key]||sessionSource?.searchParams.get(key);if(value)url.searchParams.set(key,value)}
  url.searchParams.set('resolution',${JSON.stringify(resolution)});url.searchParams.set('from','0');url.searchParams.set('to',String(Date.now()));url.searchParams.set('limit',${JSON.stringify(maxCandles)});
  const response=await fetch(url.href,{credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Chart candles unavailable');
  const data=await response.json();
  if(location.pathname!==tokenPath)throw Error('Token changed');
  return {url:location.href,tokenAddress:${JSON.stringify(target.address)},resolution:${JSON.stringify(resolution)},limit:${JSON.stringify(maxCandles)},data};
 })()`;
}

export async function readGmgnAllTimeVolume(
  execute: (script: string) => Promise<unknown>,
  target: GmgnTarget,
  observedAt: string,
  sessionParameters: Partial<Record<GmgnSessionParameterName, string>> = {},
) {
  for (const resolution of Object.keys(candleResolutions) as CandleResolution[]) {
    try {
      const parsed = parseGmgnAllTimeCandleVolume(
        await execute(
          gmgnAllTimeCandlesScript(target, resolution, sessionParameters),
        ),
        target,
        observedAt,
      );
      if (parsed) return parsed;
    } catch {
      // A missing granular range must not prevent a wider GMGN candle range.
    }
  }
  return null;
}
