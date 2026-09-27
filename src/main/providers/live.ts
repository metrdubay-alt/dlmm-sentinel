import { createHash } from "node:crypto";
import { z } from "zod";
import {
  snapshotSchema,
  mintSchema,
  providerIds,
  type Settings,
  type Snapshot,
  type ScanRequest,
} from "../../shared/schemas/domain";
import { LiveHttp, PUBLIC_RPC } from "./http";
import { fetchGmgn, normalizeGmgn, normalizeBubble } from "./connected";
import { fetchXResearch } from "./x-research";
import {
  normalizeChain,
  normalizeDex,
  normalizeRug,
  normalizeMeteora,
  normalizeHolders,
  type Normalized,
} from "./normalize";
export interface SnapshotCache {
  get(key: string): Promise<Snapshot | undefined>;
  put(key: string, snapshot: Snapshot): Promise<void>;
}
export type Credentials = {
  rpcEndpoint?: string;
  rugcheckKey?: string;
  xBearerToken?: string;
  gmgnKey?: string;
  bubblemapsKey?: string;
};
const names = {
  chain: "Solana RPC",
  holders: "Solana RPC · крупнейшие счета",
  market: "DexScreener",
  scanner: "RugCheck",
  meteora: "Meteora DLMM",
  social: "X / Social",
  url: "Проверка URL",
  legitimacy: "Подлинность проекта",
  timing: "Возраст токена / события",
  gmgn: "GMGN · холдеры / бандлеры / снайперы",
  bubblemaps: "Bubblemaps · кластеры",
};
export class LiveProviders {
  constructor(
    private cache: SnapshotCache,
    private credentials: () => Promise<Credentials> = async () => ({}),
    private fetcher: typeof fetch = fetch,
  ) {}
  private http?: LiveHttp;
  private fingerprint = "";
  async fetch(request: ScanRequest, settings: Settings): Promise<Snapshot[]> {
    const credentials = await this.credentials();
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(credentials))
      .digest("hex");
    if (!this.http || fingerprint !== this.fingerprint) {
      this.http = new LiveHttp(
        this.fetcher,
        300,
        credentials.rpcEndpoint ?? PUBLIC_RPC,
      );
      this.fingerprint = fingerprint;
    }
    const http = this.http;
    const signal = AbortSignal.timeout(
      request.mode === "quick" ? 12000 : 45000,
    );
    const mint = request.mint;
    const capture = (
      raw: unknown,
      normalize: (raw: unknown) => Normalized,
    ): Normalized => {
      const secrets = Object.values(credentials).filter(
        (s): s is string => !!s,
      );
      if (credentials.rpcEndpoint) {
        const u = new URL(credentials.rpcEndpoint);
        secrets.push(
          ...[...u.searchParams.values()].filter((s) => s.length > 3),
          ...u.pathname.split("/").filter((s) => s.length > 12),
        );
      }
      const redact = (s: string) =>
        secrets.reduce((text, key) => text.split(key).join("[REDACTED]"), s);
      const scrub = (v: unknown): unknown =>
        typeof v === "string"
          ? redact(v)
          : Array.isArray(v)
            ? v.map(scrub)
            : v && typeof v === "object"
              ? Object.fromEntries(
                  Object.entries(v).map(([k, value]) => [
                    redact(k),
                    scrub(value),
                  ]),
                )
              : v;
      const safe = scrub(raw);
      return { ...normalize(safe), rawResponse: safe };
    };
    const run = async (
      id: Snapshot["providerId"],
      enabled: boolean,
      job: () => Promise<Normalized>,
    ): Promise<Snapshot> => {
      const now = new Date().toISOString();
      const base = {
        providerId: id,
        displayName: names[id],
        fetchedAt: now,
        expiresAt: now,
        sourceUrls: [],
        sourceType: "live" as const,
        evidenceId: `live:${mint}:${id}`,
        confidence: 0,
        stale: false,
      };
      const needsKey = id === "social" || id === "gmgn" || id === "bubblemaps";
      const hasKey =
        id === "social"
          ? credentials.xBearerToken
          : id === "gmgn"
            ? credentials.gmgnKey
            : credentials.bubblemapsKey;
      if (!enabled || (needsKey && !hasKey))
        return snapshotSchema.parse({
          ...base,
          status: "unavailable",
          error: {
            code: enabled ? "MISSING_CREDENTIAL" : "DISABLED",
            message: enabled
              ? "API-ключ отсутствует. Импортируйте его локально в настройках; проверка ещё не выполнена."
              : "Источник отключён или ещё не подключён. Демо-подстановка запрещена.",
          },
        });
      const ttl = ["meteora", "gmgn", "bubblemaps"].includes(id)
        ? settings.thresholds.marketFreshMinutes
        : settings.thresholds[
            `${id as (typeof providerIds)[number]}FreshMinutes`
          ];
      const key = `v3:${mint}:${request.mode}:${id}:${ttl}:${fingerprint}`;
      let cached: Snapshot | undefined;
      try {
        cached = await this.cache.get(key);
      } catch {
        /* Cache must not prevent a network scan. */
      }
      if (cached && Date.parse(cached.expiresAt) > Date.now())
        return { ...cached, sourceType: "cached" };
      try {
        const result = await job();
        const fetchedAt = new Date().toISOString();
        const snapshot = snapshotSchema.parse({
          ...base,
          ...result,
          status: "partial",
          fetchedAt,
          expiresAt: new Date(Date.now() + ttl * 60000).toISOString(),
          sourceUrls: [
            id === "chain" || id === "holders"
              ? `https://solscan.io/token/${mint}`
              : id === "market"
                ? `https://dexscreener.com/solana/${mint}`
                : id === "scanner"
                  ? `https://rugcheck.xyz/tokens/${mint}`
                  : id === "social"
                    ? `https://x.com/search?q=${mint}`
                    : id === "gmgn"
                      ? `https://gmgn.ai/sol/token/${mint}`
                      : id === "bubblemaps"
                        ? `https://v2.bubblemaps.io/map?chain=solana&address=${mint}`
                        : "https://app.meteora.ag/",
          ],
          confidence: id === "chain" ? 85 : id === "holders" ? 40 : 65,
        });
        // Persist only allowlisted normalized fields, never headers or arbitrary API text.
        try {
          await this.cache.put(key, snapshot);
        } catch {
          /* Analysis still succeeds without cache. */
        }
        return snapshot;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const code = signal.aborted
          ? "TIMEOUT"
          : /^(RATE_LIMIT|NETWORK|HTTP_\d+|RPC_ERROR|INVALID_JSON|RESPONSE_TOO_LARGE|X_ACCESS_OR_LIMIT)$/.test(
                message,
              )
            ? message
            : "INVALID_RESPONSE";
        const failure = {
          code,
          message: `${names[id]}: ${code}. Проверка не завершена; отсутствие данных не подтверждает безопасность.`,
        };
        if (cached)
          return {
            ...cached,
            sourceType: "cached",
            stale: true,
            status: "partial",
            error: failure,
          };
        return snapshotSchema.parse({
          ...base,
          status: "error",
          error: failure,
        });
      }
    };
    const chain = run("chain", settings.providers.chain, async () =>
      capture(
        await http.rpc(
          "getAccountInfo",
          [mint, { encoding: "jsonParsed", commitment: "confirmed" }],
          signal,
        ),
        (r) => normalizeChain(r, mint),
      ),
    );
    const holders = run("holders", settings.providers.holders, async () => {
      const [raw, c] = await Promise.all([
        http.rpc(
          "getTokenLargestAccounts",
          [mint, { commitment: "confirmed" }],
          signal,
        ),
        chain,
      ]);
      const result = capture(raw, (r) =>
        normalizeHolders(
          r,
          c.stale ? undefined : c.details?.identity?.supplyRaw,
        ),
      );
      if (request.mode === "deep" && result.details.holders?.length) {
        try {
          const more = await http.rpc(
            "getMultipleAccounts",
            [
              result.details.holders.map((h) => h.address),
              { encoding: "jsonParsed", commitment: "confirmed" },
            ],
            signal,
          );
          const captured = capture(more, () => ({
            data: {},
            details: { notes: [] },
          }));
          result.rawResponse = {
            largestAccounts: result.rawResponse,
            ownerAccounts: captured.rawResponse,
          };
          const list = z
            .object({ value: z.array(z.unknown()) })
            .parse(captured.rawResponse).value;
          result.details.holders.forEach((h, i) => {
            const v = z
              .object({
                data: z.object({
                  parsed: z.object({
                    info: z.object({
                      owner: mintSchema,
                      mint: z.literal(mint),
                    }),
                  }),
                }),
              })
              .safeParse(list[i]);
            if (v.success) h.owner = v.data.data.parsed.info.owner;
          });
        } catch {
          result.details.notes.push(
            "Дополнительное раскрытие владельцев не удалось; доступна только выборка счетов.",
          );
        }
      }
      return result;
    });
    const market = run("market", settings.providers.market, async () =>
      capture(
        await http.json(
          `https://api.dexscreener.com/token-pairs/v1/solana/${mint}`,
          {},
          signal,
        ),
        (r) => normalizeDex(r, mint),
      ),
    );
    const pending = [
      chain,
      holders,
      market,
      run("scanner", settings.providers.scanner, async () =>
        capture(
          await http.json(
            `https://api.rugcheck.xyz/v1/tokens/${mint}/report`,
            {
              headers: credentials.rugcheckKey
                ? { Authorization: `Bearer ${credentials.rugcheckKey}` }
                : {},
            },
            signal,
          ),
          (r) => normalizeRug(r, mint),
        ),
      ),
      run("meteora", settings.liveMeteora, async () =>
        capture(
          await http.json(
            `https://dlmm.datapi.meteora.ag/pools?query=${mint}&page_size=20&sort_by=tvl:desc`,
            {},
            signal,
          ),
          (r) => normalizeMeteora(r, mint),
        ),
      ),
      run("gmgn", settings.liveGmgn, async () =>
        capture(
          await fetchGmgn(
            http,
            mint,
            credentials.gmgnKey!,
            request.mode === "deep",
            signal,
          ),
          (r) => normalizeGmgn(r, mint),
        ),
      ),
      run("bubblemaps", settings.liveBubblemaps, async () =>
        capture(
          await http.json(
            `https://api.bubblemaps.io/v0/tokens/map/solana/${mint}?limit=80&return_nodes=true&return_relationships=true&return_clusters=true&use_magic_nodes=false&use_time_nodes=false`,
            { headers: { "X-ApiKey": credentials.bubblemapsKey! } },
            signal,
          ),
          normalizeBubble,
        ),
      ),
      run("social", settings.providers.social, async () =>
        capture(
          await fetchXResearch(
            http,
            mint,
            credentials.xBearerToken!,
            request.mode,
            signal,
            market.then((s) => (s.stale ? [] : (s.details?.socialLinks ?? []))),
          ),
          (r) => r as Normalized,
        ),
      ),
      ...providerIds
        .filter((id) => ["url", "legitimacy", "timing"].includes(id))
        .map((id) =>
          run(id, false, async () => ({ data: {}, details: { notes: [] } })),
        ),
    ];
    return Promise.all(pending);
  }
}
