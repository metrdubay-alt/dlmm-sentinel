import { describe, it, expect } from "vitest";
import {
  normalizeChain,
  normalizeDex,
  normalizeRug,
  normalizeMeteora,
  normalizeHolders,
} from "../../main/providers/normalize";
const mint = "So11111111111111111111111111111111111111112";
const other = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const account = (supply = "1000") => ({
  value: {
    owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    data: {
      parsed: {
        type: "mint",
        info: {
          decimals: 9,
          supply,
          mintAuthority: null,
          freezeAuthority: null,
        },
      },
    },
  },
});
describe("live нормализация", () => {
  it("обычная transfer fee и initialized default state не становятся критической ловушкой", () => {
    const a = account();
    a.value.owner = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
    const info = {
      ...a.value.data.parsed.info,
      extensions: [
        {
          extension: "transferFeeConfig",
          state: {
            newerTransferFee: { transferFeeBasisPoints: 100 },
            olderTransferFee: { transferFeeBasisPoints: 100 },
          },
        },
        {
          extension: "defaultAccountState",
          state: { accountState: "initialized" },
        },
      ],
    };
    const r = normalizeChain(
      { ...a, value: { ...a.value, data: { parsed: { type: "mint", info } } } },
      mint,
    );
    expect(r.data.extensions?.some((e) => e.dangerous)).toBe(false);
  });
  it("не подставляет безопасность продажи и mutable metadata из SPL mint", () => {
    const r = normalizeChain(account(), mint);
    expect(r.data).toMatchObject({
      mintAuthority: "revoked",
      tokenProgram: "SPL",
    });
    expect(r.data.sellRestricted).toBeUndefined();
    expect(r.data.metadataMutableUnverified).toBeUndefined();
  });
  it("отклоняет не-mint и другой owner program", () => {
    expect(() => normalizeChain({ value: null }, mint)).toThrow();
    const a = account();
    a.value.owner = other;
    expect(() => normalizeChain(a, mint)).toThrow();
  });
  it("не использует цену base для mint в quote и не выдумывает drained", () => {
    const r = normalizeDex(
      [
        {
          chainId: "solana",
          dexId: "orca",
          pairAddress: other,
          baseToken: { address: other },
          quoteToken: { address: mint },
          priceUsd: "100",
          liquidity: { usd: 1000 },
          volume: { h24: 10 },
        },
      ],
      mint,
    );
    expect(r.details.pools?.[0].priceUsd).toBeUndefined();
    expect(r.data.drained).toBeUndefined();
    expect(r.data.ageHours).toBeUndefined();
  });
  it("не принимает постороннюю пару или повреждённый API", () => {
    expect(normalizeDex([], mint).data.liquidityUsd).toBeUndefined();
    expect(
      normalizeDex(
        [
          {
            chainId: "solana",
            dexId: "x",
            pairAddress: other,
            baseToken: { address: other },
            quoteToken: { address: other },
          },
        ],
        mint,
      ).details.pools,
    ).toHaveLength(0);
    expect(() => normalizeDex({ error: "bad" }, mint)).toThrow();
  });
  it("RugCheck: ноль market liquidity не доказывает rug; проверяется mint", () => {
    const r = normalizeRug(
      {
        mint,
        rugged: false,
        totalMarketLiquidity: 0,
        token: { mintAuthority: null },
        risks: [],
      },
      mint,
    );
    expect(r.data).toEqual({ rugged: false, scannerMintActive: false });
    expect(() => normalizeRug({ mint: other, rugged: true }, mint)).toThrow();
  });
  it("Meteora: сохраняет только точное совпадение mint; bins неизвестны", () => {
    const r = normalizeMeteora(
      {
        data: [
          {
            address: other,
            name: "pair",
            token_x: { address: mint },
            token_y: { address: other },
            tvl: 10,
            pool_config: { bin_step: 4 },
          },
        ],
      },
      mint,
    );
    expect(r.details.pools?.[0]).toMatchObject({
      address: other,
      binStep: 4,
      liquidityUsd: 10,
    });
    expect(r.data.executableLiquidityUsd).toBeUndefined();
  });
  it("supply=0 не создаёт проценты или инсайдеров", () => {
    const r = normalizeHolders(
      { value: [{ address: other, amount: "999999999999999999" }] },
      "0",
    );
    expect(r.details.holders?.[0].pct).toBeUndefined();
    expect(r.data.insiderPct).toBeUndefined();
  });
});
