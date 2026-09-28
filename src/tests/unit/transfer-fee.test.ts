import { describe, it, expect, vi } from "vitest";
import {
  parseSolanaTransferFee,
  fetchTransferFee,
} from "../../main/services/transfer-fee";
const target = {
  chain: "sol" as const,
  address: "So11111111111111111111111111111111111111112",
};
const account = (
  extensions: unknown[] = [],
  owner = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
) => ({
  value: {
    owner,
    data: { parsed: { type: "mint", info: { decimals: 6, extensions } } },
  },
});
const fee = (bps = 300, epoch = 10, maximumFee = "1000000000") => ({
  epoch,
  maximumFee,
  transferFeeBasisPoints: bps,
});
const ext = (older = fee(), newer = fee()) => [
  {
    extension: "transferFeeConfig",
    state: {
      olderTransferFee: older,
      newerTransferFee: newer,
      transferFeeConfigAuthority: null,
    },
  },
];
describe("token transfer fees", () => {
  it("reads 3% and cap from mint, not pool fees", () => {
    expect(parseSolanaTransferFee(account(ext()), 12)).toMatchObject({
      status: "configured",
      percent: 3,
      maximumTokens: "1000",
      canChange: false,
    });
  });
  it("uses current epoch and exposes pending fee separately", () => {
    expect(
      parseSolanaTransferFee(account(ext(fee(100), fee(300, 20))), 19),
    ).toMatchObject({ percent: 1, nextPercent: 3, nextEpoch: 20 });
    expect(
      parseSolanaTransferFee(account(ext(fee(100), fee(300, 20))), 20),
    ).toMatchObject({ percent: 3 });
  });
  it("keeps configured zero distinguishable from absent extension", () => {
    expect(
      parseSolanaTransferFee(account(ext(fee(0), fee(0))), 12).status,
    ).toBe("configured");
    expect(parseSolanaTransferFee(account([]), 12).status).toBe("none");
    expect(
      parseSolanaTransferFee(
        account([], "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        12,
      ).status,
    ).toBe("none");
  });
  it("rejects malformed data, wrong owner, invalid rates", () => {
    for (const data of [
      { value: null },
      account([], "other"),
      account(ext(fee(10001), fee(10001))),
      account([{ extension: "transferFeeConfig", state: {} }]),
    ])
      expect(() => parseSolanaTransferFee(data, 12)).toThrow();
  });
  it("failed RPC remains unknown, never 0%", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await fetchTransferFee(target, fetcher)).toMatchObject({
      status: "unknown",
    });
  });
  it("reads mint and epoch through public read-only RPC", async () => {
    const fetcher = vi.fn(
      async (_url: unknown, init?: RequestInit) =>
        new Response(
          JSON.stringify({
            result:
              JSON.parse(String(init?.body)).method === "getAccountInfo"
                ? account(ext())
                : { epoch: 12 },
          }),
        ),
    );
    expect(
      await fetchTransferFee(target, fetcher as typeof fetch),
    ).toMatchObject({ status: "configured", percent: 3, source: "Solana RPC" });
    expect(
      fetcher.mock.calls
        .map((c) => JSON.parse(String(c[1]?.body)).method)
        .sort(),
    ).toEqual(["getAccountInfo", "getEpochInfo"]);
  });
  it("does not invent transfer fees for EVM tokens", async () => {
    const fetcher = vi.fn();
    expect(
      await fetchTransferFee(
        { chain: "bsc", address: "0xcafdbce93477261db8250e42bdae6e66733f9e20" },
        fetcher,
      ),
    ).toMatchObject({ status: "unknown" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

it("accepts WOW RPC numeric maximumFee without discarding its 3% fee", () => {
  const raw = account(ext());
  const state = (
    raw.value.data.parsed.info.extensions[0] as {
      state: {
        olderTransferFee: Record<string, unknown>;
        newerTransferFee: Record<string, unknown>;
      };
    }
  ).state;
  state.olderTransferFee.maximumFee = 1000000000000000;
  state.newerTransferFee.maximumFee = 1000000000000000;
  expect(parseSolanaTransferFee(raw, 1034)).toMatchObject({
    status: "configured",
    percent: 3,
    maximumTokens: "1000000000",
  });
});

it("preserves u64 fee cap digits from numeric RPC JSON", async () => {
  const large = account(
    ext(
      fee(300, 10, "18446744073709551615"),
      fee(300, 10, "18446744073709551615"),
    ),
  );
  const fetcher = vi.fn(
    async (_url: unknown, init?: RequestInit) =>
      new Response(
        JSON.stringify({
          result:
            JSON.parse(String(init?.body)).method === "getEpochInfo"
              ? { epoch: 12 }
              : large,
        }).replaceAll('"18446744073709551615"', "18446744073709551615"),
      ),
  );
  expect(await fetchTransferFee(target, fetcher as typeof fetch)).toMatchObject(
    { percent: 3, maximumTokens: "18446744073709.551615" },
  );
});
