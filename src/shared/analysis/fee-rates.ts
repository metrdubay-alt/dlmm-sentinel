import { z } from "zod";
import { gmgnSnapshotSchema, type GmgnSnapshot } from "./gmgn";
export const FEE_RATES_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=solana%2Cbinancecoin%2Cethereum&vs_currencies=usd&include_last_updated_at=true";
const quote = z.object({
  usd: z.number().positive().finite(),
  last_updated_at: z.number().int().positive(),
});
const rates = z.object({
  solana: quote,
  binancecoin: quote.optional(),
  ethereum: quote.optional(),
});
/** Snapshot policy: <=5 minutes old, <=30 seconds future, <=2 minutes pair skew. */
export function convertFees(
  snapshot: GmgnSnapshot,
  raw: unknown,
  fetchedAt: string,
  source: "CoinGecko" | "Coinbase" = "CoinGecko",
): GmgnSnapshot {
  const result = gmgnSnapshotSchema.parse(snapshot);
  if (!result.nativeFees) return result;
  delete result.feeConversion;
  const parsed = rates.safeParse(raw),
    now = Date.parse(fetchedAt) / 1000;
  if (!parsed.success || !Number.isFinite(now)) return result;
  const { solana } = parsed.data;
  const amount = result.nativeFees.amount;
  if (
    now - solana.last_updated_at > 300 ||
    solana.last_updated_at - now > 30 ||
    amount.value === null
  )
    return result;
  if (result.nativeFees.asset === "SOL") {
    const usd = amount.value * solana.usd;
    if (!Number.isFinite(usd)) return result;
    result.feeConversion = {
      source,
      fetchedAt,
      nativeUpdatedAt: new Date(solana.last_updated_at * 1000).toISOString(),
      solUpdatedAt: new Date(solana.last_updated_at * 1000).toISOString(),
      nativeUsd: solana.usd,
      solUsd: solana.usd,
      usd,
    };
    return gmgnSnapshotSchema.parse(result);
  }
  result.metrics.totalFeesSolEquivalent = {
    display: "",
    value: null,
    precision: "missing",
  };
  const binancecoin =
    result.nativeFees.asset === "BNB"
      ? parsed.data.binancecoin
      : parsed.data.ethereum;
  if (!binancecoin) return result;
  if (
    [solana, binancecoin].some(
      (q) => now - q.last_updated_at > 300 || q.last_updated_at - now > 30,
    ) ||
    Math.abs(solana.last_updated_at - binancecoin.last_updated_at) > 120
  )
    return result;
  const usd = amount.value * binancecoin.usd,
    equivalent = usd / solana.usd;
  if (!Number.isFinite(usd) || !Number.isFinite(equivalent)) return result;
  result.feeConversion = {
    source,
    fetchedAt,
    nativeUpdatedAt: new Date(binancecoin.last_updated_at * 1000).toISOString(),
    solUpdatedAt: new Date(solana.last_updated_at * 1000).toISOString(),
    nativeUsd: binancecoin.usd,
    solUsd: solana.usd,
    usd,
  };
  result.metrics.totalFeesSolEquivalent = {
    display: `${equivalent.toLocaleString("ru-RU", { maximumFractionDigits: 4 })} SOL`,
    value: equivalent,
    precision: amount.precision,
  };
  return gmgnSnapshotSchema.parse(result);
}
