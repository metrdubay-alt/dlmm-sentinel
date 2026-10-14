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

/** A visible GMGN range measurement, not an API estimate. */
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

/**
 * The page exposes range measurements only after the visible chart range tool
 * has selected a completed range. We read that rendered overlay and never
 * synthesize a range from price candles or another token's history.
 */
export const GMGN_CHART_RANGE_SCRIPT = `(() => {
  const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility==='visible';
  const text=e=>(e?.innerText||e?.textContent||'').replace(/[\\uE000-\\uF8FF]/g,'').trim();
  const root=document.querySelector('#GlobalScrollDomId');
  if(!root) return null;
  const tokenAddress=location.pathname.split('/').at(-1)||'';
  const overlays=[...document.querySelectorAll('[data-testid*="range"],[class*="measure" i],[class*="range" i]')].filter(visible);
  const candidate=overlays.map(text).find(t=>/\\b(?:Vol|Volume|Объём|Объем)\\b/i.test(t)&&/\\bbars?\\b/i.test(t));
  if(!candidate) return null;
  const volume=/\\b(?:Vol|Volume|Объём|Объем)\\s*\\$?((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?[KMB]?)/i.exec(candidate)?.[1]||'';
  const range=root.querySelector('[data-sentinel-full-range="true"]');
  const first=Number(range?.getAttribute('data-first-completed-epoch'));
  const latest=Number(range?.getAttribute('data-latest-completed-epoch'));
  const candle=Number(range?.getAttribute('data-candle-seconds'));
  if(!range||!Number.isInteger(first)||!Number.isInteger(latest)||!Number.isInteger(candle)) return null;
  return {url:location.href,tokenAddress,fullRange:true,firstCompletedEpochSeconds:first,latestCompletedEpochSeconds:latest,candleSeconds:candle,volumeText:volume?('$'+volume):''};
})()`;

export async function readGmgnAllTimeVolume(
  execute: (script: string) => Promise<unknown>,
  target: GmgnTarget,
  observedAt: string,
) {
  try {
    return parseGmgnAllTimeVolume(
      await execute(GMGN_CHART_RANGE_SCRIPT),
      target,
      observedAt,
    );
  } catch {
    return null;
  }
}
