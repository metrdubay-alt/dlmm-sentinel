import { expect, it, vi, afterEach } from "vitest";
import { PoolSource } from "../../main/services/pool-source";
afterEach(() => vi.useRealTimers());
it("requests completed minute windows for eligible pools on the fixed public host", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T12:00:30Z"));
  const target = {
    chain: "bsc" as const,
    address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
  };
  const end = Date.parse("2026-09-26T11:59:00Z") / 1000;
  const requests: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const u = String(input);
    requests.push(u);
    return new Response(
      JSON.stringify(
        u.includes("ohlcv")
          ? {
              data: {
                attributes: {
                  ohlcv_list: Array.from({ length: 60 }, (_, i) => [
                    end - (i + 1) * 60,
                    1,
                    1,
                    1,
                    1,
                    100,
                  ]),
                },
              },
            }
          : {
              data: [
                {
                  attributes: {
                    address: "0x7a907a283ef913eb25bee3afd110f687a3fb7eed",
                    name: "GSTOCK / USDT 1%",
                    reserve_in_usd: "100000",
                    volume_usd: { m5: "500", h1: "6000" },
                  },
                  relationships: {
                    base_token: { data: { id: `bsc_${target.address}` } },
                  },
                },
              ],
            },
      ),
    );
  }) as typeof fetch;
  const pending = new PoolSource(fetcher).capture(target);
  await vi.runAllTimersAsync();
  const s = await pending;
  expect(s.rows[0]).toMatchObject({
    sum5mUsd: 500,
    sum1hUsd: 6000,
    efficiency5m: 0.005,
    efficiency1h: 0.06,
  });
  expect(requests).toHaveLength(3);
  expect(requests[0]).toContain("sort=h24_volume_usd_desc");
  expect(requests[1]).toContain("/pools/multi/");
  expect(new URL(requests[2]).searchParams.get("before_timestamp")).toBe(
    String(end - 1),
  );
  expect(
    requests.every(
      (u) => new URL(u).origin === "https://api.geckoterminal.com",
    ),
  ).toBe(true);
});
it("does not fabricate a snapshot when discovery is denied", async () => {
  const source = new PoolSource(
    (async () => new Response("", { status: 403 })) as typeof fetch,
  );
  await expect(
    source.capture({
      chain: "bsc",
      address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
    }),
  ).rejects.toThrow("403");
});

it("collects all active candidates strictly above $1000, caches discovery and retries a rate limit", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
  const target = {
    chain: "bsc" as const,
    address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
  };
  let discovery = 0,
    limited = false;
  const paths: string[] = [];
  const pools = Array.from({ length: 14 }, (_, i) => ({
    attributes: {
      address: String(i + 1).padStart(40, "0"),
      name: "DEMO / USDT 1%",
      reserve_in_usd: i === 12 ? "1000" : "1000.01",
      volume_usd: { h1: i === 13 ? "0" : "100", h24: "1000" },
    },
    relationships: { base_token: { data: { id: `bsc_${target.address}` } } },
  }));
  const fetcher = (async (url: string | URL | Request) => {
    const u = String(url);
    paths.push(u);
    if (u.includes("/tokens/")) {
      discovery++;
      return Response.json({ data: pools });
    }
    if (u.includes("/multi/"))
      return Response.json({ data: pools.slice(0, 12) });
    if (!limited) {
      limited = true;
      return new Response("", { status: 429 });
    }
    return Response.json({ data: { attributes: { ohlcv_list: [] } } });
  }) as typeof fetch;
  const source = new PoolSource(fetcher);
  const first = source.capture(target);
  await vi.runAllTimersAsync();
  expect((await first).rows).toHaveLength(12);
  expect(paths.filter((p) => p.includes("ohlcv"))).toHaveLength(13);
  const second = source.capture(target);
  await vi.runAllTimersAsync();
  await second;
  expect(discovery).toBe(1);
});

it("refreshes pools with missing or stale discovery TVL before filtering", async () => {
  vi.useFakeTimers();
  const target = {
    chain: "robinhood" as const,
    address: "0xfd1a35778d9798f13c6fb97d29c07a5ce3f7fb5e",
  };
  const pool = {
    attributes: {
      address:
        "0x21dc90c9e5e41459c0999c1e2311fd1f3b3645a8edf0186e94c8e2dfbee59f3d",
      name: "OFY / USDG 5%",
      reserve_in_usd: null as string | null,
      volume_usd: { h1: "0", h24: "100" },
    },
    relationships: {
      base_token: { data: { id: `robinhood_${target.address}` } },
    },
  };
  const fetcher = (async (url: string | URL | Request) =>
    Response.json(
      String(url).includes("ohlcv")
        ? { data: { attributes: { ohlcv_list: [] } } }
        : {
            data: [
              {
                ...pool,
                attributes: {
                  ...pool.attributes,
                  reserve_in_usd: String(url).includes("/multi/")
                    ? "48000"
                    : null,
                },
              },
            ],
          },
    )) as typeof fetch;
  const pending = new PoolSource(fetcher).capture(target);
  await vi.runAllTimersAsync();
  const snapshot = await pending;
  expect(snapshot.rows).toHaveLength(1);
  expect(snapshot.rows[0].tvlUsd).toBe(48000);
});
