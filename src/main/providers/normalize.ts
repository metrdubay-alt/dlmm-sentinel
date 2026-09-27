import { z } from "zod";
import type { Facts } from "../../shared/schemas/domain";
import type { LiveDetails, Pool } from "../../shared/schemas/live";
export type Normalized = {
  data: Facts;
  details: LiveDetails;
  rawResponse?: unknown;
};
const address = z.string().min(32).max(44);
const number = z.number().finite().nonnegative();
const token = z.object({
  address,
  name: z.string().optional(),
  symbol: z.string().optional(),
});
const SPL = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const T22 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export function normalizeChain(raw: unknown, mint: string): Normalized {
  const parsed = z
    .object({
      value: z.object({
        owner: z.enum([SPL, T22]),
        data: z.object({
          parsed: z.object({
            type: z.literal("mint"),
            info: z.object({
              decimals: number.max(255),
              supply: z.string().regex(/^\d+$/),
              mintAuthority: address.nullable(),
              freezeAuthority: address.nullable(),
              extensions: z
                .array(
                  z.object({
                    extension: z.string(),
                    state: z.unknown().optional(),
                  }),
                )
                .optional(),
            }),
          }),
        }),
      }),
    })
    .parse(raw);
  const {
    owner,
    data: {
      parsed: { info },
    },
  } = parsed.value;
  const extensions =
    owner === SPL
      ? []
      : info.extensions?.map((e) => {
          const state = z.record(z.unknown()).safeParse(e.state);
          const s = state.success ? state.data : {};
          const dangerous =
            e.extension === "nonTransferable" ||
            (e.extension === "permanentDelegate" &&
              typeof s.delegate === "string") ||
            (e.extension === "transferHook" &&
              typeof s.programId === "string") ||
            (e.extension === "pausable" && s.paused === true) ||
            (e.extension === "defaultAccountState" &&
              s.accountState === "frozen");
          return {
            name: e.extension,
            dangerous,
            explained: false,
            explanation: dangerous
              ? "Подтверждён механизм ограничения перевода или внешнего управления; требуется ручная проверка."
              : "Само наличие расширения не доказывает ловушку. Детальные параметры не проверены.",
          };
        });
  return {
    data: {
      mintAuthority:
        info.mintAuthority === null ? "revoked" : "active-unverified",
      freezeAuthority:
        info.freezeAuthority === null ? "revoked" : "active-unverified",
      tokenProgram: owner === SPL ? "SPL" : "Token-2022",
      extensions,
    },
    details: {
      identity: {
        mint,
        decimals: info.decimals,
        supplyRaw: info.supply,
        mintAuthority: info.mintAuthority,
        freezeAuthority: info.freezeAuthority,
      },
      notes: [
        "RPC проверяет полномочия mint. Продажа, метаданные и связи инсайдеров этим запросом не подтверждаются.",
      ],
    },
  };
}
export function normalizeDex(
  raw: unknown,
  mint: string,
  now = Date.now(),
): Normalized {
  const list = z
    .array(
      z.object({
        chainId: z.string(),
        dexId: z.string(),
        pairAddress: address,
        info: z
          .object({
            socials: z
              .array(z.object({ type: z.string(), url: z.string() }))
              .optional(),
          })
          .optional(),
        baseToken: token,
        quoteToken: token,
        priceUsd: z.string().optional(),
        liquidity: z.object({ usd: number.optional() }).optional(),
        volume: z.object({ h24: number.optional() }).optional(),
        fdv: number.optional(),
        pairCreatedAt: number.optional(),
        priceChange: z
          .object({ h24: z.number().finite().optional() })
          .optional(),
      }),
    )
    .max(1000)
    .parse(raw)
    .filter(
      (p) =>
        p.chainId === "solana" &&
        (p.baseToken.address === mint || p.quoteToken.address === mint),
    );
  list.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const pools: Pool[] = list.map((p) => ({
    address: p.pairAddress,
    dex: p.dexId,
    name: `${p.baseToken.symbol ?? p.baseToken.address} / ${p.quoteToken.symbol ?? p.quoteToken.address}`,
    baseMint: p.baseToken.address,
    quoteMint: p.quoteToken.address,
    liquidityUsd: p.liquidity?.usd,
    volume24h: p.volume?.h24,
    priceUsd:
      p.baseToken.address === mint &&
      p.priceUsd &&
      Number.isFinite(Number(p.priceUsd)) &&
      Number(p.priceUsd) > 0
        ? Number(p.priceUsd)
        : undefined,
    createdAt: p.pairCreatedAt,
  }));
  const p = list[0];
  return {
    data: p
      ? {
          liquidityUsd: p.liquidity?.usd,
          volumeUsd: p.volume?.h24,
          fdvUsd: p.baseToken.address === mint ? p.fdv : undefined,
          pumpPct:
            p.baseToken.address === mint ? p.priceChange?.h24 : undefined,
          poolAgeHours:
            p.pairCreatedAt !== undefined && p.pairCreatedAt <= now
              ? (now - p.pairCreatedAt) / 3600000
              : undefined,
        }
      : {},
    details: {
      pools,
      socialLinks: [
        ...new Set(
          list
            .filter((p) => p.baseToken.address === mint)
            .flatMap(
              (p) =>
                p.info?.socials
                  ?.filter((s) => s.type === "twitter")
                  .map((s) => s.url) ?? [],
            ),
        ),
      ].filter((url) => {
        try {
          const u = new URL(url);
          return u.protocol === "https:" && !u.username && !u.password;
        } catch {
          return false;
        }
      }),
      identity: p
        ? {
            mint,
            ...(p.baseToken.address === mint ? p.baseToken : p.quoteToken),
          }
        : undefined,
      notes: [
        "Рыночные показатели относятся к крупнейшему по заявленной ликвидности найденному пулу. Это не исполнимая глубина.",
        "Возраст пула не является возрастом токена. Изменение цены за 24 ч не является волатильностью.",
        "Отсутствие пары или ликвидности в API не доказывает rug pull.",
      ],
    },
  };
}
export function normalizeRug(raw: unknown, mint: string): Normalized {
  const r = z
    .object({
      mint: address,
      totalHolders: number.int().optional(),
      rugged: z.boolean().optional(),
      token: z
        .object({ mintAuthority: address.nullable().optional() })
        .nullish(),
      tokenMeta: z
        .object({ name: z.string().optional(), symbol: z.string().optional() })
        .nullish(),
      risks: z
        .array(
          z.object({
            name: z.string(),
            description: z.string().optional(),
            level: z.string().optional(),
          }),
        )
        .optional(),
    })
    .parse(raw);
  if (r.mint !== mint) throw new Error("MINT_MISMATCH");
  return {
    data: {
      rugged: r.rugged,
      scannerMintActive:
        r.token?.mintAuthority === undefined
          ? undefined
          : r.token.mintAuthority !== null,
    },
    details: {
      identity: { mint, name: r.tokenMeta?.name, symbol: r.tokenMeta?.symbol },
      holderCount: r.totalHolders,
      risks: r.risks?.map((x) => ({
        name: x.name,
        description: x.description ?? "",
        level: x.level ?? "unknown",
      })),
      notes: [
        "Флаги RugCheck — сообщения внешнего сканера, а не наш score. Пустой список не доказывает безопасность.",
        "Время обнаружения сканером не считается временем создания токена.",
      ],
    },
  };
}
export function normalizeMeteora(raw: unknown, mint: string): Normalized {
  const r = z
    .object({
      data: z
        .array(
          z.object({
            address,
            name: z.string(),
            token_x: token,
            token_y: token,
            tvl: number.optional(),
            created_at: number.optional(),
            current_price: number.optional(),
            pool_config: z
              .object({ bin_step: number, base_fee_pct: number.optional() })
              .optional(),
            dynamic_fee_pct: number.optional(),
            volume: z.object({ "24h": number.optional() }).optional(),
          }),
        )
        .max(1000),
    })
    .parse(raw);
  return {
    data: {},
    details: {
      pools: r.data
        .filter((p) => p.token_x.address === mint || p.token_y.address === mint)
        .map((p) => ({
          address: p.address,
          dex: "meteora-dlmm",
          name: p.name,
          baseMint: p.token_x.address,
          quoteMint: p.token_y.address,
          liquidityUsd: p.tvl,
          volume24h: p.volume?.["24h"],
          createdAt: p.created_at,
          binStep: p.pool_config?.bin_step,
          baseFeePct: p.pool_config?.base_fee_pct,
          dynamicFeePct: p.dynamic_fee_pct,
          priceYPerX: p.current_price,
        })),
      notes: [
        "Показаны до 20 пулов из поисковой выдачи Meteora, проверено точное совпадение mint.",
        "API не предоставляет здесь bins и исполнимую глубину. TVL не заменяет эти данные. Доходность и рекомендуемый диапазон не рассчитываются.",
      ],
    },
  };
}
export function normalizeHolders(raw: unknown, supplyRaw?: string): Normalized {
  const r = z
    .object({
      value: z
        .array(z.object({ address, amount: z.string().regex(/^\d+$/) }))
        .max(20),
    })
    .parse(raw);
  const supply = BigInt(supplyRaw ?? "0");
  return {
    data: {},
    details: {
      holders: r.value.map((a) => ({
        address: a.address,
        amountRaw: a.amount,
        pct:
          supply > 0 && BigInt(a.amount) <= supply
            ? Number((BigInt(a.amount) * 100000000n) / supply) / 1000000
            : undefined,
      })),
      notes: [
        "Top-20 token accounts, не полный список владельцев. Счета пулов и бирж не исключены; доли не используются как доказательство концентрации инсайдеров.",
        "При нулевом или неизвестном supply проценты не рассчитываются.",
      ],
    },
  };
}
