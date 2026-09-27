import { expect, it, vi } from "vitest";
import { LiveHttp, validateRpcEndpoint } from "../../main/providers/http";
it("X reset-only 429 respects cooldown on subsequent scans", async () => {
  const f = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async () =>
        new Response("limited", {
          status: 429,
          headers: {
            "x-rate-limit-reset": String(Math.ceil(Date.now() / 1000) + 60),
          },
        }),
    );
  const h = new LiveHttp(f, 0);
  const url = "https://api.x.com/2/tweets/search/recent?query=test";
  await expect(h.json(url, {}, AbortSignal.timeout(2000))).rejects.toThrow(
    "RATE_LIMIT",
  );
  await expect(h.json(url, {}, AbortSignal.timeout(2000))).rejects.toThrow(
    "RATE_LIMIT",
  );
  expect(f).toHaveBeenCalledTimes(1);
});
it("X archive requests are spaced by at least one second", async () => {
  const starts: number[] = [];
  const f = vi.fn<typeof fetch>().mockImplementation(async () => {
    starts.push(Date.now());
    return new Response("{}");
  });
  const h = new LiveHttp(f, 0);
  await Promise.all(
    [1, 2].map(() =>
      h.json(
        "https://api.x.com/2/tweets/search/all?query=test",
        {},
        AbortSignal.timeout(4000),
      ),
    ),
  );
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000);
});
it("длинный Retry-After ограничивает и следующий скан", async () => {
  const f = vi.fn().mockResolvedValue(
    new Response("limited", {
      status: 429,
      headers: { "retry-after": "60" },
    }),
  );
  const h = new LiveHttp(f, 0);
  await expect(
    h.json("https://api.rugcheck.xyz/x", {}, AbortSignal.timeout(1000)),
  ).rejects.toThrow("RATE_LIMIT");
  await expect(
    h.json("https://api.rugcheck.xyz/x", {}, AbortSignal.timeout(1000)),
  ).rejects.toThrow("RATE_LIMIT");
  expect(f).toHaveBeenCalledTimes(1);
});
it("блокирует произвольные URL и RPC запись", async () => {
  const fetcher = vi.fn();
  const h = new LiveHttp(fetcher);
  await expect(
    h.json("https://localhost/", {}, AbortSignal.timeout(500)),
  ).rejects.toThrow();
  await expect(
    h.rpc("sendTransaction", [], AbortSignal.timeout(500)),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  expect(() =>
    validateRpcEndpoint("https://api.mainnet-beta.solana.com.evil.test/"),
  ).toThrow();
});
it("повторяет 429 и не сохраняет текст ошибки с секретами", async () => {
  const f = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("secret", { status: 429, headers: { "retry-after": "0" } }),
    )
    .mockResolvedValueOnce(new Response('{"ok":true}'));
  expect(
    await new LiveHttp(f, 0).json(
      "https://api.rugcheck.xyz/v1/tokens/x/report",
      {},
      AbortSignal.timeout(1000),
    ),
  ).toEqual({ ok: true });
  expect(f).toHaveBeenCalledTimes(2);
  const bad = new LiveHttp(
    vi.fn().mockRejectedValue(new Error("api-key=SECRET")),
    0,
  );
  await expect(
    bad.json("https://api.rugcheck.xyz/x", {}, AbortSignal.timeout(1000)),
  ).rejects.toThrow("NETWORK");
});
it("таймаут и слишком большой ответ завершаются ошибкой", async () => {
  const h = new LiveHttp(
    vi
      .fn()
      .mockResolvedValue(
        new Response("x", { headers: { "content-length": "99999999" } }),
      ),
    0,
  );
  await expect(
    h.json("https://api.rugcheck.xyz/x", {}, AbortSignal.timeout(1000)),
  ).rejects.toThrow("RESPONSE_TOO_LARGE");
  const signal = AbortSignal.abort();
  await expect(
    h.json("https://api.rugcheck.xyz/x", {}, signal),
  ).rejects.toThrow();
});
