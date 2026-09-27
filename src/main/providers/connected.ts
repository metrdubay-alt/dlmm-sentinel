import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Normalized } from "./normalize";
import type { LiveHttp } from "./http";

const numeric = z
  .union([z.number(), z.string().regex(/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/)])
  .transform(Number)
  .pipe(z.number().finite());
const optionalNumber = numeric.nullish();
const optionalRatio = numeric.pipe(z.number().min(0).max(1)).nullish();
const wallet = z.object({
  address: z.string(),
  amount_percentage: optionalRatio,
  realized_profit: optionalNumber,
  unrealized_profit: optionalNumber,
  transfer_in: z.boolean().nullish(),
  maker_token_tags: z.array(z.string()).nullish(),
});
export function normalizeGmgn(raw: unknown, mint: string): Normalized {
  const r = z
    .object({
      info: z.object({
        address: z.literal(mint),
        holder_count: numeric.pipe(z.number().int().nonnegative()).nullish(),
        circulating_supply: optionalNumber,
        price: z.object({ price: optionalNumber }).nullish(),
      }),
      security: z
        .object({
          bundler_trader_amount_rate: optionalRatio,
          rat_trader_amount_rate: optionalRatio,
          sniper_count: optionalNumber,
        })
        .optional(),
      holders: z.object({ list: z.array(wallet).max(100) }).optional(),
      bundlers: z.object({ list: z.array(wallet).max(100) }).optional(),
      snipers: z.object({ list: z.array(wallet).max(100) }).optional(),
      failures: z.array(z.string()).optional(),
    })
    .parse(raw);
  const rows = new Map<string, z.infer<typeof wallet>>();
  for (const [group, list] of [
    ["", r.holders],
    ["bundler", r.bundlers],
    ["sniper", r.snipers],
  ] as const) {
    for (const w of list?.list ?? []) {
      const prior = rows.get(w.address);
      rows.set(w.address, {
        ...w,
        maker_token_tags: [
          ...new Set([
            ...(prior?.maker_token_tags ?? []),
            ...(w.maker_token_tags ?? []),
            ...(group ? [group] : []),
          ]),
        ],
      });
    }
  }
  const cap =
    r.info.price?.price != null && r.info.circulating_supply != null
      ? r.info.price.price * r.info.circulating_supply
      : undefined;
  return {
    data: {},
    details: {
      holderCount: r.info.holder_count ?? undefined,
      marketCapUsd:
        cap !== undefined && Number.isFinite(cap) && cap >= 0 ? cap : undefined,
      metrics: [
        {
          label: "Бандлеры: доля торгового объёма (не supply)",
          value:
            r.security?.bundler_trader_amount_rate == null
              ? undefined
              : r.security.bundler_trader_amount_rate * 100,
          unit: "%",
        },
        {
          label: "Rat traders: доля торгового объёма",
          value:
            r.security?.rat_trader_amount_rate == null
              ? undefined
              : r.security.rat_trader_amount_rate * 100,
          unit: "%",
        },
        {
          label: "Снайперы по маркировке GMGN",
          value: r.security?.sniper_count ?? undefined,
          unit: "кошельков",
        },
      ].filter(
        (x): x is { label: string; value: number; unit: string } =>
          x.value !== undefined,
      ),
      wallets: [...rows.values()].map((w) => ({
        address: w.address,
        pct:
          w.amount_percentage == null ? undefined : w.amount_percentage * 100,
        tags: w.maker_token_tags ?? [],
        realizedUsd: w.realized_profit ?? undefined,
        unrealizedUsd: w.unrealized_profit ?? undefined,
        transferred: w.transfer_in ?? undefined,
      })),
      notes: [
        "Маркировка и PnL предоставлены GMGN. Это не доказательство общего владельца или мошенничества. Себестоимость полученных переводом токенов отдельно не проверена.",
        "Market cap рассчитан как price × circulating_supply из одного ответа GMGN; FDV не подставляется.",
        "До 20 крупнейших холдеров; в глубоком режиме дополнительно до 100 текущих бандлеров и до 100 снайперов. Это выборка, не полная доля всех бандлеров. Полностью вышедшие кошельки и начальная доля не установлены.",
        "Phishing: N/A — соответствующее поле не подтверждено контрактом этого API. Это не нулевой риск ссылок.",
        ...(r.failures ?? []),
      ],
    },
  };
}

export async function fetchGmgn(
  http: LiveHttp,
  mint: string,
  key: string,
  deep: boolean,
  signal: AbortSignal,
): Promise<unknown> {
  const call = async (path: string, extra: Record<string, string> = {}) => {
    const query = new URLSearchParams({
      chain: "sol",
      address: mint,
      ...extra,
      timestamp: String(Math.floor(Date.now() / 1000)),
      client_id: randomUUID(),
    });
    const raw = await http.json(
      `https://openapi.gmgn.ai${path}?${query}`,
      { headers: { "X-APIKEY": key } },
      signal,
    );
    const envelope = z
      .object({ code: z.literal(0), data: z.unknown() })
      .parse(raw);
    return envelope.data;
  };
  const info = await call("/v1/token/info");
  const result: Record<string, unknown> = { info };
  const failures: string[] = [];
  for (const [name, path, extra] of [
    ["security", "/v1/token/security", {}],
    ["holders", "/v1/market/token_top_holders", { limit: "20" }],
    ...(deep
      ? [
          [
            "bundlers",
            "/v1/market/token_top_holders",
            { tag: "bundler", limit: "100" },
          ],
          [
            "snipers",
            "/v1/market/token_top_holders",
            { tag: "sniper", limit: "100" },
          ],
        ]
      : []),
  ] as [string, string, Record<string, string>][]) {
    try {
      result[name] = await call(path, extra);
    } catch {
      failures.push(
        `GMGN ${name}: запрос не выполнен; проверьте доступ/лимит.`,
      );
    }
  }
  return { ...result, failures };
}

export function normalizeBubble(raw: unknown): Normalized {
  const r = z
    .object({
      metadata: z.object({ dt_update: z.string(), ts_update: z.number() }),
      clusters: z
        .array(
          z.object({
            share: z.number().finite().nonnegative(),
            holder_count: z.number().int().nonnegative(),
            holders: z.array(z.string()),
          }),
        )
        .nullish(),
    })
    .parse(raw);
  return {
    data: {},
    details: {
      sourceUpdatedAt: new Date(r.metadata.ts_update * 1000).toISOString(),
      clusters: r.clusters?.map((c) => ({
        shareRaw: c.share,
        holderCount: c.holder_count,
        holders: c.holders,
      })),
      notes: [
        "Карта Bubblemaps ограничена 80 крупнейшими холдерами. Связь переводом не доказывает одного владельца. Magic/time nodes отключены: общий CEX не объединяет владельцев автоматически.",
        "share показан в единицах API без преобразования в проценты: диапазон единиц не закреплён OpenAPI. Снимок может быть старше времени запроса.",
        "Переводы и узлы сохранены в исходном ответе. Метки кластера не считаются доказанными инсайдерами.",
      ],
    },
  };
}

const xPage = z.object({
  data: z
    .array(
      z.object({
        id: z.string().regex(/^\d+$/),
        text: z.string(),
        author_id: z.string().optional(),
        created_at: z.string().optional(),
      }),
    )
    .optional(),
  includes: z
    .object({
      users: z
        .array(
          z.object({
            id: z.string(),
            username: z.string().regex(/^[A-Za-z0-9_]{1,15}$/),
          }),
        )
        .optional(),
    })
    .optional(),
  meta: z.object({
    next_token: z.string().optional(),
    result_count: z.number().optional(),
  }),
  errors: z.array(z.unknown()).optional(),
});
export async function fetchX(
  http: LiveHttp,
  mint: string,
  key: string,
  mode: "quick" | "deep",
  signal: AbortSignal,
): Promise<Normalized> {
  const days = mode === "deep" ? 30 : 7;
  const end = new Date(Date.now() - 30000).toISOString();
  const start = new Date(
    Date.parse(end) - days * 86400000 + 60000,
  ).toISOString();
  const posts = new Map<
    string,
    NonNullable<Normalized["details"]["social"]>["posts"][number]
  >();
  const rawPages: unknown[] = [];
  const notes: string[] = [];
  let next: string | undefined;
  let complete = false;
  const query = mint;
  for (let page = 0; page < (mode === "deep" ? 5 : 2); page++) {
    const params = new URLSearchParams({
      query,
      start_time: start,
      end_time: end,
      max_results: "100",
      "tweet.fields": "created_at,author_id",
      expansions: "author_id",
      "user.fields": "username",
      ...(next ? { next_token: next } : {}),
    });
    let raw: unknown;
    try {
      raw = await http.json(
        `https://api.x.com/2/tweets/search/${mode === "deep" ? "all" : "recent"}?${params}`,
        { headers: { Authorization: `Bearer ${key}` } },
        signal,
      );
    } catch {
      if (!rawPages.length) throw new Error("X_ACCESS_OR_LIMIT");
      notes.push("Одна из страниц не получена. Период проверен не полностью.");
      break;
    }
    const r = xPage.parse(raw);
    rawPages.push(raw);
    for (const p of r.data ?? []) {
      const user = r.includes?.users?.find((u) => u.id === p.author_id);
      posts.set(p.id, {
        id: p.id,
        text: p.text,
        authorId: p.author_id,
        username: user?.username,
        createdAt: p.created_at,
        url: `https://x.com/i/web/status/${p.id}`,
        warningTerms: [
          ...new Set(
            p.text
              .toLowerCase()
              .match(
                /\b(scam|rug|insider|bundled|honeypot|phishing|fake)\b|dev sold/g,
              ) ?? [],
          ),
        ],
      });
    }
    next = r.meta.next_token;
    if (r.errors?.length) {
      notes.push("X вернул частичные ошибки. Охват не подтверждён.");
      break;
    }
    if (!next) {
      complete = true;
      break;
    }
  }
  return {
    data: {},
    rawResponse: { pages: rawPages },
    details: {
      social: {
        periodDays: days,
        start,
        end,
        complete,
        pages: rawPages.length,
        query,
        posts: [...posts.values()],
      },
      notes: [
        `Поиск X по точному mint за ${days} дней. ${complete ? "Все страницы полученной выдачи прочитаны." : "Выдача ограничена или запрос прерван: охват неполный."}`,
        "Ключевые слова — повод проверить сообщение, не доказательство rug. Отсутствие упоминаний не доказывает безопасность. Посты без mint этим поиском не охвачены.",
        "Подлинность официального профиля, история его активности, роль авторов, боты и endorsement автоматически не подтверждены. Цитирование, лайк и тег не означают участия.",
        ...notes,
      ],
    },
  };
}
