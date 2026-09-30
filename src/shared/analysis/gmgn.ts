import { z } from "zod";
import { mintSchema } from "../schemas/domain";
import type { StrategyInput } from "./strategy";
export const gmgnLabels: Record<string, string[]> = {
  "Top 10": ["Top 10", "Топ 10"],
  Holders: ["Holders", "Холдеры", "Держатели"],
  Snipers: ["Snipers", "Снайперы"],
  DEV: ["DEV"],
  "Total Fees": ["Total Fees", "Всего комиссий"],
  Bundler: ["Bundler", "Бандлеры", "Бандлер"],
  Phishing: ["Phishing", "Фишинг", "Фишинговый кошелёк"],
  "Market cap": ["Market cap", "Капитализация", "Рыночная капитализация"],
  "Token created": ["Token created", "Токен создан", "Создание токена"],
  "Pool created": [
    "Pool created",
    "Пул создан",
    "Создание пула",
    "Время создания пула",
  ],
  "Total liq": ["Total liq", "Общая ликвидность", "Общ. ликвидность"],
};
function canonicalFields(fields: Record<string, string>) {
  const result = { ...fields };
  for (const [key, aliases] of Object.entries(gmgnLabels)) {
    const values = [...new Set(aliases.map((a) => fields[a]).filter(Boolean))];
    if (values.length === 1) result[key] = values[0];
    else if (values.length > 1) result[key] = "";
  }
  return result;
}
const evmAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((s) => s.toLowerCase());
const walletAddress = z.union([mintSchema, evmAddress]);
export const gmgnTargetSchema = z.discriminatedUnion("chain", [
  z.object({ chain: z.literal("sol"), address: mintSchema }).strict(),
  z.object({ chain: z.literal("bsc"), address: evmAddress }).strict(),
  z.object({ chain: z.literal("eth"), address: evmAddress }).strict(),
  z.object({ chain: z.literal("base"), address: evmAddress }).strict(),
  z.object({ chain: z.literal("robinhood"), address: evmAddress }).strict(),
]);
export type GmgnTarget = z.infer<typeof gmgnTargetSchema>;
const measurementSchema = z
  .object({
    display: z.string().max(200),
    value: z.number().finite().nonnegative().nullable(),
    precision: z.enum(["display", "rounded", "missing"]),
  })
  .strict();
const holderSchema = z.object({
  address: walletAddress,
  tags: z.array(z.string().max(100)).max(30),
  remainingUsd: measurementSchema,
  remainingShare: z.string().max(200),
  unrealizedUsd: measurementSchema.extend({
    value: z.number().finite().nullable(),
  }),
  unrealizedRoiPct: z.number().finite().nullable(),
  unrealizedDisplay: z.string().max(200),
});
const holdersSchema = z.object({
  state: z.enum(["unavailable", "empty", "partial"]),
  complete: z.literal(false),
  rows: z.array(holderSchema).max(200),
  conflictingAddresses: z.array(walletAddress).max(200),
  unidentifiedRows: z.number().int().nonnegative(),
});
export const gmgnSnapshotSchema = z
  .object({
    target: gmgnTargetSchema,
    sourceUrl: z.string().url(),
    observedAt: z.string().datetime(),
    parserVersion: z.literal("gmgn-dom-1"),
    holders: holdersSchema.optional(),
    poolAddresses: z.array(walletAddress).max(100).optional(),
    nativeFees: z
      .object({
        asset: z.enum(["SOL", "BNB", "ETH"]),
        amount: measurementSchema,
      })
      .optional(),
    feeConversion: z
      .object({
        source: z.enum(["CoinGecko", "Coinbase"]),
        fetchedAt: z.string().datetime(),
        nativeUpdatedAt: z.string().datetime(),
        solUpdatedAt: z.string().datetime(),
        nativeUsd: z.number().positive().finite(),
        solUsd: z.number().positive().finite(),
        usd: z.number().nonnegative().finite(),
      })
      .optional(),
    watchers: measurementSchema.optional(),
    displayedPoolLiquidity: measurementSchema.optional(),
    metrics: z.object({
      top10Pct: measurementSchema,
      bundlersPct: measurementSchema,
      phishingPct: measurementSchema,
      holderCount: measurementSchema,
      marketCapUsd: measurementSchema,
      volume5mUsd: measurementSchema,
      volume1hUsd: measurementSchema.default({
        display: "",
        value: null,
        precision: "missing",
      }),
      totalFeesSolEquivalent: measurementSchema,
      snipersPct: measurementSchema,
      devPct: measurementSchema,
    }),
    volumePeriod: z.string().max(20),
    createdAtDisplay: z.string().max(100),
    poolCreatedAtDisplay: z.string().max(100),
    limitations: z.array(z.string().max(500)).max(20),
  })
  .strict();
export type GmgnSnapshot = z.infer<typeof gmgnSnapshotSchema>;
export function holderPressure(snapshot: GmgnSnapshot) {
  const rows = (snapshot.holders?.rows ?? []).filter(
    (r) => !snapshot.poolAddresses?.includes(r.address),
  );
  const liquidity = snapshot.displayedPoolLiquidity?.value;
  const active = rows
    .filter((r) => r.remainingUsd.value !== null && r.remainingUsd.value > 0)
    .map((r) => ({
      ...r,
      positionToPoolPct:
        liquidity && liquidity > 0
          ? (r.remainingUsd.value! / liquidity) * 100
          : null,
    }));
  return {
    byPosition: [...active]
      .sort((a, b) => b.remainingUsd.value! - a.remainingUsd.value!)
      .slice(0, 10),
    byProfit: active
      .filter(
        (r) => r.unrealizedUsd.value !== null && r.unrealizedUsd.value > 0,
      )
      .sort((a, b) => b.unrealizedUsd.value! - a.unrealizedUsd.value!)
      .slice(0, 10),
    unknownBalanceCount: rows.filter((r) => r.remainingUsd.value === null)
      .length,
  };
}
export const gmgnHistorySchema = z.array(gmgnSnapshotSchema).max(100);
const text = z.string().max(200);
const rawSchema = z.object({
  url: z.string().max(2048),
  tokenLinks: z.array(z.string().max(2048)).max(100),
  poolLinks: z.array(z.string().max(2048)).max(100).default([]),
  info: z.record(text),
  risk: z.record(text),
  pool: z.record(text),
  tooltips: z.array(z.string().max(2000)).max(20),
  volumeText: text,
  volumePeriod: z.string().max(20),
  feeIcon: text,
  watchersText: text.default(""),
  holdersState: z
    .enum(["unavailable", "empty", "partial"])
    .default("unavailable"),
  holders: z
    .array(
      z.object({
        address: text,
        tags: z.array(z.string().max(100)).max(30),
        unrealized: text,
        remaining: text,
      }),
    )
    .max(200)
    .default([]),
});
function parseHolders(
  x: z.infer<typeof rawSchema>,
  chain: GmgnTarget["chain"],
): z.infer<typeof holdersSchema> {
  const rows = new Map<string, z.infer<typeof holderSchema>>();
  const conflicts = new Set<string>();
  let unidentifiedRows = 0;
  for (const raw of x.holders) {
    const identity = (chain === "sol" ? mintSchema : evmAddress).safeParse(
      raw.address,
    );
    if (!identity.success) {
      unidentifiedRows++;
      continue;
    }
    const [profit = "", roi = ""] = raw.unrealized
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const [remaining = "", share = ""] = raw.remaining
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const amount = measurement(profit.replace(/^[+−-]/, ""));
    if (/^[−-]/.test(profit) && amount.value !== null) amount.value *= -1;
    amount.display = profit;
    const roiMatch = /^([+−-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)%$/.exec(
      roi,
    );
    const roiValue = roiMatch
      ? Number(roiMatch[1].replaceAll(",", "").replace("−", "-"))
      : null;
    const row = {
      address: identity.data,
      tags: [...new Set(raw.tags)].sort(),
      remainingUsd: measurement(remaining),
      remainingShare: share,
      unrealizedUsd: amount,
      unrealizedRoiPct:
        roiValue !== null && Number.isFinite(roiValue) ? roiValue : null,
      unrealizedDisplay: raw.unrealized,
    };
    const previous = rows.get(row.address);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row))
      conflicts.add(row.address);
    else rows.set(row.address, row);
  }
  for (const address of conflicts) rows.delete(address);
  return {
    state: x.holdersState,
    complete: false,
    rows: [...rows.values()],
    conflictingAddresses: [...conflicts],
    unidentifiedRows,
  };
}
function measurement(
  display = "",
  percent = false,
): z.infer<typeof measurementSchema> {
  const s = display.replace(/[\uE000-\uF8FF]/g, "").trim();
  const match =
    /^\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)([KMB])?(%)?$/.exec(s);
  if (!match || (percent && match[3] !== "%") || (!percent && match[3]))
    return { display: s, value: null, precision: "missing" };
  const value =
    Number(match[1].replaceAll(",", "")) *
    (match[2]
      ? ({ K: 1e3, M: 1e6, B: 1e9 } as Record<string, number>)[match[2]]
      : 1);
  if (
    !Number.isFinite(value) ||
    value > Number.MAX_SAFE_INTEGER ||
    (percent && value > 100)
  )
    return { display: s, value: null, precision: "missing" };
  return { display: s, value, precision: match[2] ? "rounded" : "display" };
}
export function parseGmgnCard(
  raw: unknown,
  requested: GmgnTarget,
  observedAt: string,
): GmgnSnapshot {
  const target = gmgnTargetSchema.parse(requested),
    x = rawSchema.parse(raw),
    url = new URL(x.url);
  const path = `/${target.chain}/token/${target.address}`;
  const explorer = {
    sol: "https://solscan.io",
    bsc: "https://bscscan.com",
    eth: "https://etherscan.io",
    base: "https://basescan.org",
    robinhood: "https://robin.etherscan.io",
  }[target.chain];
  const canonical = (s: string) =>
    target.chain !== "sol" ? s.toLowerCase() : s;
  if (
    url.origin !== "https://gmgn.ai" ||
    url.username ||
    url.password ||
    canonical(url.pathname) !== path ||
    !x.tokenLinks.some((link) => {
      try {
        const u = new URL(link);
        return (
          u.origin === explorer &&
          !u.username &&
          !u.password &&
          canonical(u.pathname) === `/token/${target.address}`
        );
      } catch {
        return false;
      }
    })
  )
    throw new Error(
      "Карточка GMGN не совпадает с сетью и полным адресом токена.",
    );
  x.info = canonicalFields(x.info);
  x.risk = canonicalFields(x.risk);
  x.pool = canonicalFields(x.pool);
  const missing = () => measurement("");
  const bundleMatches = x.tooltips
    .map((t) => /Bundlers hold\s+(\d+(?:\.\d+)?%)/.exec(t)?.[1])
    .filter((s): s is string => !!s);
  const bundlers =
    bundleMatches.length === 1
      ? measurement(bundleMatches[0], true)
      : { ...measurement(x.risk.Bundler, true), precision: "rounded" as const };
  // Basic Data provides the full count; the compact card can include growth.
  const detailedHolders = measurement(x.pool.Holders);
  const compactHolders = (x.info.Holders ?? "").replace(
    /\s+[+−-]?\d+(?:[.,]\d+)?%\s*$/,
    "",
  );
  const holders =
    detailedHolders.value !== null && detailedHolders.precision === "display"
      ? detailedHolders
      : measurement(compactHolders);
  if (holders.value !== null && !Number.isInteger(holders.value)) {
    holders.value = null;
    holders.precision = "missing";
  }
  const poolAddresses = x.poolLinks.flatMap((link) => {
    try {
      const u = new URL(link);
      if (u.origin !== explorer || u.username || u.password) return [];
      const a = /^\/address\/([^/]+)$/.exec(u.pathname)?.[1];
      const result = (
        target.chain === "sol" ? mintSchema : evmAddress
      ).safeParse(a);
      return result.success ? [result.data] : [];
    } catch {
      return [];
    }
  });
  const asset =
    target.chain === "sol" && x.feeIcon === "IconSolanabal14pxS"
      ? "SOL"
      : target.chain === "bsc" && x.feeIcon === "IconBscbal12px"
        ? "BNB"
        : (target.chain === "base" && x.feeIcon === "IconBaseeth10016pxS") ||
            (target.chain === "robinhood" &&
              x.feeIcon === "IconRobinhoodeth16pxS")
          ? "ETH"
          : null;
  return gmgnSnapshotSchema.parse({
    target,
    poolAddresses: [...new Set(poolAddresses)],
    ...(asset
      ? { nativeFees: { asset, amount: measurement(x.info["Total Fees"]) } }
      : {}),
    sourceUrl: `https://gmgn.ai${path}`,
    observedAt,
    parserVersion: "gmgn-dom-1",
    holders: parseHolders(x, target.chain),
    watchers: measurement(x.watchersText),
    displayedPoolLiquidity: measurement(
      (x.pool["Total liq"] ?? "").split("(")[0].trim(),
    ),
    metrics: {
      top10Pct: measurement(x.info["Top 10"], true),
      bundlersPct: bundlers,
      phishingPct: measurement(x.risk.Phishing, true),
      holderCount: holders,
      marketCapUsd: measurement(x.pool["Market cap"]),
      volume5mUsd:
        x.volumePeriod === "5m" ? measurement(x.volumeText) : missing(),
      volume1hUsd:
        x.volumePeriod === "1h" ? measurement(x.volumeText) : missing(),
      totalFeesSolEquivalent:
        asset === "SOL" ? measurement(x.info["Total Fees"]) : missing(),
      snipersPct: measurement(x.info.Snipers, true),
      devPct: measurement(x.info.DEV, true),
    },
    volumePeriod: x.volumePeriod,
    createdAtDisplay: x.pool["Token created"] ?? "",
    poolCreatedAtDisplay: x.pool["Pool created"] ?? "",
    limitations: [
      "Источник: видимые поля GMGN. Точность ограничена представлением сайта; дополнительные знаки не выдумываются.",
      "Сокращённые суммы K/M/B не используются для точного прохода порогов.",
      "Полный рейтинг нереализованной прибыли бандлеров не подтверждён.",
      "Рекомендация использует дату создания токена GMGN; дата без часового пояса читается в местном времени. Это не возраст первого пула.",
      "Total Fees — показатель GMGN; для BNB нужен свежий курс в эквивалент SOL. Это не доходность конкретного LP-пула.",
    ],
  });
}
export function tokenAgeDays(
  display: string,
  observedAt: string,
): number | null {
  let epoch: number;
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    display.trim(),
  );
  if (m) {
    const [, mm, dd, yy, hh, mi, ss] = m.map(Number);
    const d = new Date(yy, mm - 1, dd, hh, mi, ss);
    if (
      d.getFullYear() !== yy ||
      d.getMonth() !== mm - 1 ||
      d.getDate() !== dd ||
      d.getHours() !== hh ||
      d.getMinutes() !== mi ||
      d.getSeconds() !== ss
    )
      return null;
    epoch = d.getTime();
  } else if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(display))
    epoch = Date.parse(display);
  else return null;
  const age = (Date.parse(observedAt) - epoch) / 86400000;
  return Number.isFinite(age) && age >= 0 ? age : null;
}
export function capRange(m: GmgnSnapshot["metrics"]["marketCapUsd"]) {
  if (m.value == null || m.precision !== "rounded") return null;
  const parts = /^\$?\s*([\d,.]+)([KMB])$/.exec(m.display.trim());
  if (!parts) return null;
  const decimals = parts[1].split(".")[1]?.length ?? 0;
  const step =
    { K: 1e3, M: 1e6, B: 1e9 }[parts[2] as "K" | "M" | "B"] / 10 ** decimals;
  return { lower: Math.max(0, m.value - step), upper: m.value + step };
}
export function gmgnStrategyInput(s: GmgnSnapshot): StrategyInput {
  const value = (key: keyof GmgnSnapshot["metrics"]) =>
    s.metrics[key].precision === "display" ? s.metrics[key].value : null;
  return {
    watchers:
      s.watchers?.precision === "display" &&
      s.watchers.value !== null &&
      Number.isInteger(s.watchers.value)
        ? s.watchers.value
        : null,
    top10Pct: value("top10Pct"),
    bundlersPct: value("bundlersPct"),
    phishingPct: value("phishingPct"),
    holderCount: value("holderCount"),
    marketCapUsd: value("marketCapUsd"),
    volume5mUsd: value("volume5mUsd"),
    totalFeesSolEquivalent: value("totalFeesSolEquivalent"),
    ageDays: tokenAgeDays(s.createdAtDisplay, s.observedAt),
    marketCapRange: capRange(s.metrics.marketCapUsd),
    previousHourVolumeUsd: null,
    holderGrowth: null,
    bundlerRankingComplete: false,
  };
}
