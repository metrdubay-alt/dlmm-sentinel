import { z } from "zod";
const amount = z.number().finite().nonnegative();
export const solQuoteSchema = z
  .object({
    usd: z.number().finite().positive(),
    observedAt: z.string().datetime(),
    source: z.literal("Coinbase"),
  })
  .strict();
export type SolQuote = z.infer<typeof solQuoteSchema>;
export const minuteVolumeSchema = z
  .object({
    source: z.literal("GMGN"),
    observedAt: z.string().datetime(),
    endEpochSeconds: z.number().int().positive(),
    poolAddress: z.string().max(100).optional(),
    quote: solQuoteSchema.nullable(),
    candles: z
      .array(
        z
          .object({
            time: z.number().int().positive(),
            volumeUsd: amount.nullable(),
            volumeSol: amount.nullable(),
          })
          .strict(),
      )
      .refine((rows) => rows.length === 5 || rows.length === 10),
    issue: z.string().max(300).optional(),
  })
  .strict()
  .transform((s) =>
    s.candles.length === 10
      ? s
      : {
          ...s,
          candles: [
            ...Array.from({ length: 5 }, (_, i) => ({
              time: s.endEpochSeconds - 600 + i * 60,
              volumeUsd: null,
              volumeSol: null,
            })),
            ...s.candles,
          ],
          issue:
            "Сохранены только пять минут. Обновите числовой анализ для десяти свечей.",
        },
  );
export type MinuteVolumeSnapshot = z.infer<typeof minuteVolumeSchema>;
export function parseSolQuote(raw: unknown, now: number): SolQuote | null {
  const p = z
    .object({ price: z.string().regex(/^\d+(?:\.\d+)?$/), time: z.string() })
    .safeParse(raw);
  if (!p.success) return null;
  const usd = Number(p.data.price),
    time = Date.parse(p.data.time);
  if (
    !(usd > 0) ||
    !Number.isFinite(usd) ||
    !Number.isFinite(time) ||
    now - time > 300000 ||
    time - now > 30000
  )
    return null;
  return { usd, observedAt: new Date(time).toISOString(), source: "Coinbase" };
}
export function minuteVolumeSnapshot(
  raw: unknown,
  now: number,
  quote: SolQuote | null,
): MinuteVolumeSnapshot {
  const end = Math.floor(now / 60000) * 60;
  const parsed = z
    .object({
      code: z.literal(0),
      data: z.object({
        list: z.array(z.unknown()).max(2000),
        _debug_tpool: z.object({ pool_address: z.string().max(100) }).nullish(),
      }),
    })
    .safeParse(raw);
  const values = new Map<number, number | null>();
  if (parsed.success)
    for (const item of parsed.data.data.list) {
      const p = z
        .object({
          time: z.number().int().positive(),
          volume: z.union([z.number(), z.string().regex(/^\d+(?:\.\d+)?$/)]),
        })
        .safeParse(item);
      if (!p.success) continue;
      const time = p.data.time / 1000,
        volume = Number(p.data.volume);
      if (time % 60 !== 0 || time < end - 600 || time >= end) continue;
      values.set(
        time,
        values.has(time) || !Number.isFinite(volume) || volume < 0
          ? null
          : volume,
      );
    }
  const freshQuote =
    quote &&
    now - Date.parse(quote.observedAt) <= 300000 &&
    Date.parse(quote.observedAt) - now <= 30000
      ? solQuoteSchema.parse(quote)
      : null;
  const candles = Array.from({ length: 10 }, (_, i) => {
    const time = end - 600 + i * 60,
      volumeUsd = values.get(time) ?? null;
    const converted =
      volumeUsd !== null && freshQuote ? volumeUsd / freshQuote.usd : null;
    return {
      time,
      volumeUsd,
      volumeSol:
        converted !== null && Number.isFinite(converted) ? converted : null,
    };
  });
  return minuteVolumeSchema.parse({
    source: "GMGN",
    observedAt: new Date(now).toISOString(),
    endEpochSeconds: end,
    quote: freshQuote,
    candles,
    poolAddress: parsed.success
      ? parsed.data.data._debug_tpool?.pool_address
      : undefined,
    issue: !parsed.success
      ? "Минутные свечи GMGN недоступны."
      : candles.some((c) => c.volumeUsd === null)
        ? "Не все десять завершённых минут получены."
        : !freshQuote
          ? "Свежий курс SOL недоступен."
          : undefined,
  });
}
export function minimumMinuteVolume(
  snapshot: MinuteVolumeSnapshot,
): number | null {
  const values = snapshot.candles.map((c) => c.volumeSol);
  return values.every((v): v is number => v !== null)
    ? Math.min(...values)
    : null;
}
