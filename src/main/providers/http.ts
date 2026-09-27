import { setTimeout as delay } from "node:timers/promises";
export const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";
export function validateRpcEndpoint(value: string) {
  const u = new URL(value);
  const allowed =
    u.hostname === "api.mainnet-beta.solana.com" ||
    u.hostname === "mainnet.helius-rpc.com" ||
    u.hostname === "solana-rpc.publicnode.com" ||
    u.hostname.endsWith(".quiknode.pro");
  if (
    !allowed ||
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.hash ||
    (u.port && u.port !== "443")
  )
    throw new Error("RPC_ENDPOINT_NOT_ALLOWED");
  return u.href;
}
const readMethods = new Set([
  "getAccountInfo",
  "getTokenLargestAccounts",
  "getMultipleAccounts",
]);
export class LiveHttp {
  private next = new Map<string, number>();
  private cooldown = new Map<string, number>();
  constructor(
    private fetcher: typeof fetch = fetch,
    private spacing = 250,
    private endpoint = PUBLIC_RPC,
  ) {
    validateRpcEndpoint(endpoint);
  }
  async json(
    url: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<unknown> {
    const u = new URL(url);
    const rpc = url === this.endpoint;
    if (
      !rpc &&
      (![
        "api.dexscreener.com",
        "api.rugcheck.xyz",
        "dlmm.datapi.meteora.ag",
        "api.x.com",
        "openapi.gmgn.ai",
        "api.bubblemaps.io",
      ].includes(u.hostname) ||
        u.protocol !== "https:" ||
        u.port ||
        u.username ||
        u.password)
    )
      throw new Error("HOST_NOT_ALLOWED");
    if (!rpc && init.method && init.method !== "GET")
      throw new Error("READ_ONLY");
    const restricted: Record<string, RegExp> = {
      "api.x.com":
        /^\/2\/(tweets\/search\/(recent|all)|users\/by\/username\/[A-Za-z0-9_]{1,15}|users\/\d+\/tweets)$/,
      "openapi.gmgn.ai":
        /^\/v1\/(token\/(info|security)|market\/token_top_holders)$/,
      "api.bubblemaps.io":
        /^\/v0\/tokens\/map\/solana\/[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    };
    if (restricted[u.hostname] && !restricted[u.hostname].test(u.pathname))
      throw new Error("READ_ONLY");
    if (rpc) {
      let body: { method?: string };
      try {
        body = JSON.parse(String(init.body));
      } catch {
        throw new Error("RPC_READ_ONLY");
      }
      if (!readMethods.has(body.method ?? "")) throw new Error("RPC_READ_ONLY");
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      signal.throwIfAborted();
      if ((this.cooldown.get(u.hostname) ?? 0) > Date.now())
        throw new Error("RATE_LIMIT");
      const start = Math.max(Date.now(), this.next.get(u.hostname) ?? 0);
      this.next.set(
        u.hostname,
        start +
          (["openapi.gmgn.ai", "api.x.com"].includes(u.hostname)
            ? Math.max(this.spacing, 1100)
            : this.spacing),
      );
      await delay(Math.max(0, start - Date.now()), undefined, { signal });
      if ((this.cooldown.get(u.hostname) ?? 0) > Date.now())
        throw new Error("RATE_LIMIT");
      let response: Response;
      try {
        response = await this.fetcher(url, {
          ...init,
          redirect: "error",
          signal,
        });
      } catch {
        throw new Error(signal.aborted ? "TIMEOUT" : "NETWORK");
      }
      if (response.status === 429 || response.status >= 500) {
        const resetAt = Number(
          response.headers.get("x-rate-limit-reset") ??
            response.headers.get("x-ratelimit-reset"),
        );
        const retry =
          response.headers.get("retry-after") ??
          (resetAt > Date.now() / 1000
            ? String(resetAt - Date.now() / 1000)
            : null);
        const seconds = retry === null ? 0.5 : Number(retry);
        const wait = Number.isFinite(seconds)
          ? seconds * 1000
          : Math.max(0, Date.parse(retry!) - Date.now());
        await response.body?.cancel();
        if (Number.isFinite(wait) && wait > 0)
          this.cooldown.set(u.hostname, Date.now() + wait);
        // GMGN authentication includes a short-lived timestamp. A new scan
        // prepares fresh auth; never replay the same prepared request here.
        if (u.hostname === "openapi.gmgn.ai")
          throw new Error(
            response.status === 429 ? "RATE_LIMIT" : `HTTP_${response.status}`,
          );
        if (wait > 5000) throw new Error("RATE_LIMIT");
        if (attempt === 1)
          throw new Error(
            response.status === 429 ? "RATE_LIMIT" : `HTTP_${response.status}`,
          );
        await delay(
          Math.max(0, Number.isFinite(wait) ? wait : 500),
          undefined,
          { signal },
        );
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(
          response.status === 429 ? "RATE_LIMIT" : `HTTP_${response.status}`,
        );
      }
      if (Number(response.headers.get("content-length")) > 4_000_000) {
        await response.body?.cancel();
        throw new Error("RESPONSE_TOO_LARGE");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("EMPTY_RESPONSE");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 4_000_000) throw new Error("RESPONSE_TOO_LARGE");
          chunks.push(value);
        }
      } catch (e) {
        await reader.cancel();
        throw e;
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new Error("INVALID_JSON");
      }
    }
    throw new Error("NETWORK");
  }
  async rpc(
    method: string,
    params: unknown[],
    signal: AbortSignal,
  ): Promise<unknown> {
    if (!readMethods.has(method)) throw new Error("RPC_READ_ONLY");
    const raw = await this.json(
      this.endpoint,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      },
      signal,
    );
    if (!raw || typeof raw !== "object" || !("result" in raw) || "error" in raw)
      throw new Error("RPC_ERROR");
    return raw.result;
  }
}
