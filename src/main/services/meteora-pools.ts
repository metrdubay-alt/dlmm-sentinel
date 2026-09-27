import { z } from "zod";
import type { GmgnTarget } from "../../shared/analysis/gmgn";
import {
  poolSnapshotSchema,
  type PoolRow,
} from "../../shared/analysis/pool-snapshot";
const mint = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
const token = z.object({ address: mint, symbol: z.string() });
const discovered = z.object({
  pool_address: mint,
  pool_type: z.enum(["dlmm", "damm_v2"]),
  token_x: token,
  token_y: token,
  tvl: z.number().nonnegative().nullable(),
  active_tvl: z.number().nonnegative().nullable(),
  fee_pct: z.number().nonnegative().nullable(),
  dlmm_params: z.object({ bin_step: z.number() }).nullable().optional(),
});
const discovery = z.object({
  data: z.array(discovered),
  has_more: z.boolean(),
  after_key: z.string().nullable().optional(),
});
export function meteoraVolumes(raw: unknown, end: number) {
  const r = z
    .object({
      start_time: z.literal(end - 3600),
      end_time: z.literal(end),
      data: z.array(
        z.object({
          timestamp: z.number().int(),
          volume: z.number().nonnegative(),
        }),
      ),
    })
    .parse(raw);
  const seen = new Set<number>();
  const totals = [0, 0, 0, 0];
  for (const row of r.data) {
    if (row.timestamp % 300 || seen.has(row.timestamp))
      throw Error("Некорректные интервалы Meteora");
    seen.add(row.timestamp);
    [300, 600, 1800, 3600].forEach((w, i) => {
      if (row.timestamp >= end - w && row.timestamp < end)
        totals[i] += row.volume;
    });
  }
  return totals;
}
export async function captureMeteora(
  target: GmgnTarget,
  fetcher: typeof fetch = fetch,
) {
  const get = async (url: string) => {
    const r = await fetcher(url, {
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!r.ok) throw Error(`Meteora HTTP ${r.status}`);
    return r.json();
  };
  const pools = new Map<string, z.infer<typeof discovered>>();
  const cursors = new Set<string>();
  let after = "",
    complete = false;
  for (let page = 0; page < 20; page++) {
    const d = discovery.parse(
      await get(
        `https://pool-discovery-api.datapi.meteora.ag/pools?category=all&timeframe=5m&page_size=1000&sort_by=tvl:desc&query=${encodeURIComponent(target.address)}${after ? `&after_key=${encodeURIComponent(after)}` : ""}`,
      ),
    );
    for (const p of d.data)
      if (
        p.token_x.address === target.address ||
        p.token_y.address === target.address
      )
        pools.set(p.pool_address, p);
    if (pools.size > 200)
      throw Error(
        "Более 200 пулов Meteora: список требует дополнительной загрузки",
      );
    if (!d.has_more) {
      complete = true;
      break;
    }
    if (!d.after_key || cursors.has(d.after_key))
      throw Error("Ошибка пагинации Meteora");
    after = d.after_key;
    cursors.add(after);
  }
  if (!complete) throw Error("Не удалось получить полный список Meteora");
  const end = Math.floor(Date.now() / 300000) * 300;
  const candidates = [...pools.values()].filter((p) => (p.tvl ?? 0) > 1000);
  const rows: PoolRow[] = [];
  for (let i = 0; i < candidates.length; i += 3) {
    rows.push(
      ...(await Promise.all(
        candidates.slice(i, i + 3).map(async (p) => {
          const base =
            p.pool_type === "dlmm"
              ? "https://dlmm.datapi.meteora.ag"
              : "https://damm-v2.datapi.meteora.ag";
          const [meta, history] = await Promise.allSettled([
            get(`${base}/pools/${p.pool_address}`),
            get(
              `${base}/pools/${p.pool_address}/volume/history?timeframe=5m&start_time=${end - 3600}&end_time=${end}`,
            ),
          ]);
          let fee = p.fee_pct,
            dynamic: number | null = null,
            tvl = p.tvl;
          const issues: string[] = [];
          if (meta.status === "fulfilled") {
            const d = z
              .object({
                address: mint,
                token_x: token,
                token_y: token,
                tvl: z.number().nonnegative(),
                pool_config: z
                  .object({ base_fee_pct: z.number().nonnegative() })
                  .optional(),
                dynamic_fee_pct: z.number().nonnegative().optional(),
              })
              .safeParse(meta.value);
            if (
              d.success &&
              d.data.address === p.pool_address &&
              [d.data.token_x.address, d.data.token_y.address].includes(
                target.address,
              )
            ) {
              tvl = d.data.tvl;
              if (p.pool_type === "dlmm") {
                fee = d.data.pool_config?.base_fee_pct ?? null;
                dynamic = d.data.dynamic_fee_pct ?? null;
              }
            } else issues.push("Метаданные пула недоступны");
          } else issues.push("Метаданные пула недоступны");
          let vol: (number | null)[] = [null, null, null, null];
          if (history.status === "fulfilled") {
            try {
              vol = meteoraVolumes(history.value, end);
            } catch {
              issues.push("Некорректная история объёмов");
            }
          } else issues.push("История объёмов недоступна");
          const score = (v: number | null) =>
            v !== null &&
            fee !== null &&
            dynamic !== null &&
            (p.active_tvl ?? 0) > 0
              ? (v / p.active_tvl!) * (fee + dynamic)
              : null;
          if (p.pool_type === "damm_v2")
            issues.push("Dynamic Fee / Score недоступны");
          return {
            address: p.pool_address,
            name: `${p.token_x.symbol} / ${p.token_y.symbol}`,
            dex: p.pool_type === "dlmm" ? "Meteora DLMM" : "Meteora DAMM v2",
            poolType: p.pool_type,
            binStep: p.dlmm_params?.bin_step ?? null,
            tvlUsd: tvl,
            activeTvlUsd: p.active_tvl,
            feePct: fee,
            dynamicFeePct: dynamic,
            feeSource: "field" as const,
            volume5mUsd: vol[0],
            volume1hUsd: vol[3],
            sum5mUsd: vol[0],
            sum10mUsd: vol[1],
            sum30mUsd: vol[2],
            sum1hUsd: vol[3],
            volumeMomentumPct:
              vol[0] !== null && vol[2] !== null && vol[2] > vol[0]
                ? (vol[0] / 5 / ((vol[2] - vol[0]) / 25) - 1) * 100
                : null,
            efficiency5m: score(vol[0]),
            efficiency1h: score(vol[3]),
            issue: issues.join("; "),
          };
        }),
      )),
    );
  }
  return poolSnapshotSchema.parse({
    target,
    source: "Meteora",
    observedAt: new Date().toISOString(),
    endEpochSeconds: end,
    discoveryComplete: complete,
    discoveredCount: pools.size,
    rows: rows.filter((p) => (p.tvlUsd ?? 0) > 1000),
  });
}
