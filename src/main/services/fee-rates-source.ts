import { z } from "zod";
import { convertFees, FEE_RATES_URL } from "../../shared/analysis/fee-rates";
import type { GmgnSnapshot } from "../../shared/analysis/gmgn";
const ticker = z.object({
  price: z.string().regex(/^\d+(?:\.\d+)?$/),
  time: z.string(),
});
export async function enrichFees(
  snapshot: GmgnSnapshot,
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<GmgnSnapshot> {
  if (!snapshot.nativeFees || snapshot.nativeFees.asset === "SOL")
    return snapshot;
  const get = async (url: string) => {
    const r = await fetcher(url, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`Rates HTTP ${r.status}`);
    return r.json() as Promise<unknown>;
  };
  const missing = convertFees(snapshot, {}, now().toISOString());
  try {
    const raw = await get(FEE_RATES_URL);
    const result = convertFees(missing, raw, now().toISOString());
    if (result.feeConversion) return result;
  } catch {
    /* Try the independent public backup. */
  }
  try {
    const native = snapshot.nativeFees.asset;
    const quotes = await Promise.all(
      ["SOL", native].map(async (asset) => {
        const raw = ticker.parse(
          await get(
            `https://api.exchange.coinbase.com/products/${asset}-USD/ticker`,
          ),
        );
        return {
          usd: Number(raw.price),
          last_updated_at: Math.floor(Date.parse(raw.time) / 1000),
        };
      }),
    );
    return convertFees(
      missing,
      {
        solana: quotes[0],
        [native === "BNB" ? "binancecoin" : "ethereum"]: quotes[1],
      },
      now().toISOString(),
      "Coinbase",
    );
  } catch {
    return missing;
  }
}
