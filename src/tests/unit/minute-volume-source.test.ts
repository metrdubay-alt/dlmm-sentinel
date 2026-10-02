import { expect, it, vi } from "vitest";
import {
  captureMinuteVolumes,
  minuteReadScript,
} from "../../main/services/minute-volume-source";
const target = {
  chain: "sol" as const,
  address: "7VertkgF9KLhxxJXHX6uaWuoYZTP9LdGj2bWmVXVpump",
};
const now = Date.parse("2026-10-02T13:30:45Z");
it("skips other networks and still returns candle gaps when the source fails", async () => {
  const read = vi.fn(async () => {
    throw Error("Network failure");
  });
  const fetcher = vi.fn(async () => {
    throw Error("Offline");
  }) as unknown as typeof fetch;
  expect(
    await captureMinuteVolumes(
      { chain: "eth", address: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9" },
      read,
      fetcher,
      () => now,
    ),
  ).toBeUndefined();
  expect(read).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  const result = await captureMinuteVolumes(target, read, fetcher, () => now);
  expect(result?.candles).toHaveLength(10);
  expect(result?.candles.every((c) => c.volumeSol === null)).toBe(true);
});
it("reads real individual volumes and rejects a response for another token", async () => {
  const list = Array.from({ length: 11 }, (_, i) => ({
    time: Date.parse("2026-10-02T13:20:00Z") + i * 60000,
    volume: "40000",
  }));
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ price: "100", time: "2026-10-02T13:30:40Z" }),
      ),
  ) as unknown as typeof fetch;
  const read = vi.fn(async () => ({
    code: 0,
    data: {
      list,
      _debug_tpool: { base_address: target.address, pool_address: "pool" },
    },
  }));
  expect(
    (await captureMinuteVolumes(target, read, fetcher, () => now))?.candles.map(
      (c) => c.volumeSol,
    ),
  ).toEqual(Array(10).fill(400));
  const wrong = async () => ({
    code: 0,
    data: { list, _debug_tpool: { base_address: "other" } },
  });
  expect(
    (
      await captureMinuteVolumes(target, wrong, fetcher, () => now)
    )?.candles.every((c) => c.volumeSol === null),
  ).toBe(true);
  expect(minuteReadScript(target.address)).toContain("resolution");
});

it("fixes the completed-minute window before a request crosses the minute boundary", async () => {
  const start = Date.parse("2026-10-02T13:30:59Z");
  let clock = start;
  const end = Math.floor(start / 60000) * 60000;
  const read = async () => {
    clock += 2000;
    return {
      code: 0,
      data: {
        list: Array.from({ length: 11 }, (_, i) => ({
          time: end - 600000 + i * 60000,
          volume: "10000",
        })),
      },
    };
  };
  const fetcher = (async () =>
    Response.json({
      price: "100",
      time: new Date(start).toISOString(),
    })) as typeof fetch;
  const result = await captureMinuteVolumes(target, read, fetcher, () => clock);
  expect(result?.endEpochSeconds).toBe(end / 1000);
  expect(result?.candles.at(-1)?.time).toBe(end / 1000 - 60);
});
