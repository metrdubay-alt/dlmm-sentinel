import { z } from "zod";
import { gmgnTargetSchema, type GmgnTarget } from "./gmgn";
import { sumMinuteVolume, estimatePoolYield } from "./pool-yield";
const amount = z.number().finite().nonnegative().nullable();
export const poolRowSchema = z.object({
  address: z.string().regex(/^[A-Za-z0-9]{20,100}$/),
  name: z.string().max(200),
  dex: z.string().max(100),
  tvlUsd: amount,
  feePct: z.number().min(0).max(100).nullable(),
  feeSource: z.enum(["field", "name", "missing"]),
  poolType: z.enum(["dlmm", "damm_v2"]).optional(),
  binStep: amount.optional(),
  activeTvlUsd: amount.optional(),
  dynamicFeePct: amount.optional(),
  sum10mUsd: amount.optional(),
  sum30mUsd: amount.optional(),
  volumeMomentumPct: z.number().finite().nullable().optional(),
  volume24hUsd: amount.optional(),
  volume5mUsd: amount,
  volume1hUsd: amount,
  sum5mUsd: amount,
  sum1hUsd: amount,
  efficiency5m: amount,
  efficiency1h: amount,
  issue: z.string().max(200),
});
export const poolSnapshotSchema = z.object({
  target: gmgnTargetSchema,
  observedAt: z.string().datetime(),
  endEpochSeconds: z.number().int(),
  source: z.enum(["GeckoTerminal", "Meteora"]),
  discoveredCount: z.number().int().nonnegative().optional(),
  discoveryComplete: z.boolean(),
  rows: z.array(poolRowSchema).max(200),
});
export type PoolRow = z.infer<typeof poolRowSchema>;
export type PoolSnapshot = z.infer<typeof poolSnapshotSchema>;
export const poolNetwork = (target: GmgnTarget) =>
  target.chain === "sol" ? "solana" : target.chain;
function number(value: unknown): number | null {
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    String(value).trim() === ""
  )
    return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function parsePoolPage(raw: unknown, target: GmgnTarget): PoolRow[] {
  const body = z
    .object({
      data: z.array(
        z.object({
          attributes: z.record(z.unknown()),
          relationships: z.record(z.unknown()),
        }),
      ),
    })
    .parse(raw);
  const tokenId = `${poolNetwork(target)}_${target.address}`;
  return body.data.flatMap((p) => {
    const rel = z
      .object({
        base_token: z.object({ data: z.object({ id: z.string() }) }).optional(),
        quote_token: z
          .object({ data: z.object({ id: z.string() }) })
          .optional(),
        dex: z.object({ data: z.object({ id: z.string() }) }).optional(),
      })
      .safeParse(p.relationships);
    if (
      !rel.success ||
      ![rel.data.base_token?.data.id, rel.data.quote_token?.data.id].some(
        (id) =>
          target.chain !== "sol"
            ? id?.toLowerCase() === tokenId.toLowerCase()
            : id === tokenId,
      )
    )
      return [];
    const a = p.attributes,
      name = String(a.name ?? "").slice(0, 200),
      field = number(a.pool_fee_percentage),
      nameFee = number(name.match(/\s([0-9]+(?:\.[0-9]+)?)%$/)?.[1]);
    const fee = field ?? nameFee;
    const volumes = z.record(z.unknown()).safeParse(a.volume_usd);
    const parsed = poolRowSchema.safeParse({
      address: a.address,
      name,
      dex: rel.data.dex?.data.id ?? "",
      tvlUsd: number(a.reserve_in_usd),
      feePct: fee != null && fee <= 100 ? fee : null,
      feeSource:
        fee == null || fee > 100 ? "missing" : field != null ? "field" : "name",
      volume24hUsd: number(volumes.success ? volumes.data.h24 : null),
      volume5mUsd: number(volumes.success ? volumes.data.m5 : null),
      volume1hUsd: number(volumes.success ? volumes.data.h1 : null),
      sum5mUsd: null,
      sum1hUsd: null,
      efficiency5m: null,
      efficiency1h: null,
      issue: "Минутные объёмы ещё не получены",
    });
    return parsed.success ? [parsed.data] : [];
  });
}
export function withPoolCandles(
  pool: PoolRow,
  raw: unknown,
  end: number,
): PoolRow {
  const list = z
    .object({
      data: z.object({
        attributes: z.object({
          ohlcv_list: z.array(
            z.tuple([
              z.number(),
              z.number(),
              z.number(),
              z.number(),
              z.number(),
              z.number(),
            ]),
          ),
        }),
      }),
    })
    .parse(raw).data.attributes.ohlcv_list;
  const candles = list.map((c) => ({ timestamp: c[0], volumeUsd: c[5] }));
  // Same trailing-empty-interval policy as «Пулы приоритет» gcVolumes_.
  const sum5mUsd = sumMinuteVolume(candles, end, 5, true),
    sum1hUsd = sumMinuteVolume(candles, end, 60, true);
  const efficiency = (volumeUsd: number | null) =>
    estimatePoolYield({
      volumeUsd,
      feeFraction: pool.feePct == null ? null : pool.feePct / 100,
      totalTvlUsd: pool.tvlUsd,
      denominator: "total",
    }).percent;
  return {
    ...pool,
    sum5mUsd,
    sum1hUsd,
    efficiency5m: efficiency(sum5mUsd),
    efficiency1h: efficiency(sum1hUsd),
    issue:
      sum5mUsd == null || sum1hUsd == null
        ? "Неполные минутные данные"
        : pool.feePct == null
          ? "Нет ставки комиссии"
          : "",
  };
}
export function rankPools(rows: PoolRow[], window: "5m" | "1h") {
  const key = window === "5m" ? "efficiency5m" : "efficiency1h";
  return [...rows].sort(
    (a, b) =>
      Number((b.tvlUsd ?? 0) > 1000) - Number((a.tvlUsd ?? 0) > 1000) ||
      (b[key] ?? -1) - (a[key] ?? -1) ||
      a.address.localeCompare(b.address),
  );
}
