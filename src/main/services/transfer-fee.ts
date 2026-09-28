import { z } from "zod";
import { gmgnTargetSchema, type GmgnTarget } from "../../shared/analysis/gmgn";
import type { TransferFee } from "../../shared/analysis/transfer-fee";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const schedule = z.object({
  epoch: integer,
  maximumFee: z.union([z.string().regex(/^\d+$/), integer.transform(String)]),
  transferFeeBasisPoints: z.number().int().min(0).max(10000),
});
function tokenAmount(raw: string, decimals: number) {
  const digits = BigInt(raw)
    .toString()
    .padStart(decimals + 1, "0");
  return decimals
    ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`.replace(
        /\.?0+$/,
        "",
      )
    : digits;
}
export function parseSolanaTransferFee(
  raw: unknown,
  epoch: number,
): Omit<TransferFee, "observedAt" | "source"> {
  integer.parse(epoch);
  const a = z
    .object({
      value: z.object({
        owner: z.enum([TOKEN, TOKEN2022]),
        data: z.object({
          parsed: z.object({
            type: z.literal("mint"),
            info: z.object({
              decimals: z.number().int().min(0).max(255),
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
    .parse(raw).value;
  if (a.owner === TOKEN) return { status: "none" };
  const extensions = a.data.parsed.info.extensions;
  if (!extensions) throw Error("Extensions unavailable");
  const configs = extensions.filter((e) => e.extension === "transferFeeConfig");
  if (!configs.length) return { status: "none" };
  if (configs.length !== 1) throw Error("Ambiguous config");
  const config = z
    .object({
      olderTransferFee: schedule,
      newerTransferFee: schedule,
      transferFeeConfigAuthority: z.string().nullable(),
    })
    .parse(configs[0].state);
  const current =
    epoch >= config.newerTransferFee.epoch
      ? config.newerTransferFee
      : config.olderTransferFee;
  return {
    status: "configured",
    percent: current.transferFeeBasisPoints / 100,
    maximumTokens: tokenAmount(current.maximumFee, a.data.parsed.info.decimals),
    canChange: config.transferFeeConfigAuthority !== null,
    ...(epoch < config.newerTransferFee.epoch
      ? {
          nextPercent: config.newerTransferFee.transferFeeBasisPoints / 100,
          nextEpoch: config.newerTransferFee.epoch,
        }
      : {}),
  };
}
export async function fetchTransferFee(
  input: GmgnTarget,
  fetcher: typeof fetch = fetch,
): Promise<TransferFee> {
  const target = gmgnTargetSchema.parse(input),
    observedAt = new Date().toISOString();
  if (target.chain !== "sol")
    return {
      status: "unknown",
      observedAt,
      source: "",
      reason: "Автопроверка Transfer Fee для этой сети пока недоступна.",
    };
  const sourceUrl = `https://solscan.io/token/${target.address}`;
  for (const endpoint of [
    "https://api.mainnet-beta.solana.com",
    "https://solana-rpc.publicnode.com",
  ]) {
    try {
      const signal = AbortSignal.timeout(6000);
      const rpc = async (method: string, params: unknown[]) => {
        const response = await fetcher(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal,
          redirect: "error",
        });
        if (!response.ok) throw Error("RPC unavailable");
        const data = z
          .object({ result: z.unknown(), error: z.unknown().optional() })
          .parse(
            JSON.parse(
              (await response.text()).replace(
                /("maximumFee"\s*:\s*)(\d+)(?=\s*[,}])/g,
                '$1"$2"',
              ),
            ),
          );
        if (data.error) throw Error("RPC error");
        return data.result;
      };
      const [mint, epoch] = await Promise.all([
        rpc("getAccountInfo", [
          target.address,
          { encoding: "jsonParsed", commitment: "confirmed" },
        ]),
        rpc("getEpochInfo", [{ commitment: "confirmed" }]),
      ]);
      return {
        ...parseSolanaTransferFee(
          mint,
          z.object({ epoch: integer }).parse(epoch).epoch,
        ),
        observedAt,
        source: "Solana RPC",
        sourceUrl,
      };
    } catch {
      /* Read-only fallback; missing data is never a zero fee. */
    }
  }
  return {
    status: "unknown",
    observedAt,
    source: "Solana RPC",
    sourceUrl,
    reason: "Не удалось проверить комиссию за перевод.",
  };
}
