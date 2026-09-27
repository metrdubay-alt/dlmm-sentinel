import { it, expect, vi } from "vitest";
import { LiveProviders, type SnapshotCache } from "../../main/providers/live";
import {
  defaultSettings,
  type Snapshot,
  type ScanRequest,
} from "../../shared/schemas/domain";
import { analyze } from "../../shared/analysis/analyze";
const mint = "So11111111111111111111111111111111111111112";
const request: ScanRequest = {
  mint,
  scenario: "new-token",
  mode: "quick",
  dataMode: "live",
};
const settings = { ...defaultSettings, demoMode: false };
const cache = () => {
  const values = new Map<string, Snapshot>();
  return {
    values,
    get: async (k: string) => values.get(k),
    put: async (k: string, v: Snapshot) => {
      values.set(k, v);
    },
  } satisfies SnapshotCache & { values: Map<string, Snapshot> };
};
const fetcher = () =>
  vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    const s = String(url);
    let raw: unknown;
    if (s.includes("solana.com")) {
      const { method } = JSON.parse(String(init?.body));
      raw = {
        result:
          method === "getAccountInfo"
            ? {
                value: {
                  owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                  data: {
                    parsed: {
                      type: "mint",
                      info: {
                        mintAuthority: null,
                        freezeAuthority: null,
                        decimals: 9,
                        supply: "100",
                      },
                    },
                  },
                },
              }
            : { value: [] },
      };
    } else if (s.includes("rugcheck"))
      raw = { mint, rugged: false, token: { mintAuthority: null }, risks: [] };
    else if (s.includes("meteora")) raw = { data: [] };
    else raw = [];
    return new Response(JSON.stringify(raw));
  });
it("live не подставляет mocks; кэш повторно используется без сети", async () => {
  const c = cache(),
    f = fetcher(),
    p = new LiveProviders(c, undefined, f);
  const first = await p.fetch(request, settings);
  expect(first).toHaveLength(11);
  expect(first.some((s) => s.sourceType === "mock")).toBe(false);
  expect(first.find((s) => s.providerId === "social")?.status).toBe(
    "unavailable",
  );
  for (const id of ["social", "gmgn", "bubblemaps"]) {
    expect(first.find((s) => s.providerId === id)?.error?.code).toBe(
      "MISSING_CREDENTIAL",
    );
  }
  const count = f.mock.calls.length;
  const second = await p.fetch(request, settings);
  expect(f.mock.calls.length).toBe(count);
  expect(second.find((s) => s.providerId === "chain")?.sourceType).toBe(
    "cached",
  );
  const report = analyze(
    request,
    first,
    settings,
    new Date().toISOString(),
    "live",
  );
  expect(report.sourceType).toBe("live");
  expect(report.suitability.verdict).toBe("MANUAL_REVIEW");
  expect(report.confidence.total).toBeGreaterThan(0);
  expect(report.score.contributions.every((c) => c.sourceType !== "mock")).toBe(
    true,
  );
});
it("connected adapters keep credentials out of cached evidence and preserve X access errors", async () => {
  const f = fetcher(),
    original = f.getMockImplementation()!;
  const secret = "TEST_SECRET_NEVER_EXPORT";
  f.mockImplementation(async (url, init) => {
    const u = new URL(String(url));
    if (u.hostname === "api.x.com")
      return new Response(secret, { status: 403 });
    if (u.hostname === "openapi.gmgn.ai") {
      expect(new Headers(init?.headers).get("X-APIKEY")).toBe(secret);
      return new Response(
        JSON.stringify({
          code: 0,
          data: u.pathname.endsWith("info")
            ? { address: mint, holder_count: 42, echo: secret }
            : u.pathname.endsWith("security")
              ? {}
              : { list: [] },
        }),
      );
    }
    if (u.hostname === "api.bubblemaps.io")
      return new Response(
        JSON.stringify({
          metadata: { dt_update: "2026-09-23", ts_update: 1790000000 },
          clusters: [],
          echo: secret,
        }),
      );
    return original(url, init);
  });
  const c = cache();
  const r = await new LiveProviders(
    c,
    async () => ({
      xBearerToken: secret,
      gmgnKey: secret,
      bubblemapsKey: secret,
    }),
    f,
  ).fetch(request, settings);
  expect(r.find((s) => s.providerId === "gmgn")?.details?.holderCount).toBe(42);
  expect(r.find((s) => s.providerId === "social")?.status).toBe("error");
  expect(JSON.stringify(r)).not.toContain(secret);
  expect(JSON.stringify([...c.values.values()])).not.toContain(secret);
});
it("отключённый источник не читает кэш и не обращается в сеть", async () => {
  const c = cache(),
    f = fetcher(),
    p = new LiveProviders(c, undefined, f);
  await p.fetch(request, settings);
  f.mockClear();
  const r = await p.fetch(request, {
    ...settings,
    providers: {
      ...settings.providers,
      chain: false,
      holders: false,
      scanner: false,
      market: false,
    },
    liveMeteora: false,
  });
  expect(f).not.toHaveBeenCalled();
  expect(r.every((s) => s.status === "unavailable")).toBe(true);
});
it("deep RPC не выпускает отражённые секреты через owner/rawResponse", async () => {
  const secret = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const f = fetcher(),
    original = f.getMockImplementation()!;
  f.mockImplementation(async (url, init) => {
    if (String(url).includes("solana.com")) {
      const { method } = JSON.parse(String(init?.body));
      if (method === "getTokenLargestAccounts")
        return new Response(
          JSON.stringify({
            result: { value: [{ address: mint, amount: "1" }] },
          }),
        );
      if (method === "getMultipleAccounts")
        return new Response(
          JSON.stringify({
            result: {
              value: [{ data: { parsed: { info: { owner: secret, mint } } } }],
            },
          }),
        );
    }
    return original(url, init);
  });
  const r = await new LiveProviders(
    cache(),
    async () => ({ rugcheckKey: secret }),
    f,
  ).fetch({ ...request, mode: "deep" }, settings);
  expect(JSON.stringify(r)).not.toContain(secret);
});
it("при сбое возвращает устаревший снимок с исходным временем, без обновления TTL", async () => {
  const c = cache(),
    f = fetcher(),
    p = new LiveProviders(c, undefined, f);
  await p.fetch(request, settings);
  for (const [k, v] of c.values)
    c.values.set(k, {
      ...v,
      fetchedAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2020-01-01T00:01:00.000Z",
    });
  f.mockRejectedValue(new Error("secret error"));
  const r = await p.fetch(request, settings),
    chain = r.find((s) => s.providerId === "chain")!;
  expect(chain).toMatchObject({
    sourceType: "cached",
    stale: true,
    fetchedAt: "2020-01-01T00:00:00.000Z",
    error: { code: "NETWORK" },
  });
  expect(JSON.stringify(r)).not.toContain("secret error");
  const report = analyze(
    request,
    r,
    settings,
    new Date().toISOString(),
    "stale",
  );
  expect(report.confidence.total).toBe(0);
});
