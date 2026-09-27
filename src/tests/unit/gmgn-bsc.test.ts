import { expect, it } from "vitest";
import {
  parseGmgnCard,
  gmgnStrategyInput,
  holderPressure,
} from "../../shared/analysis/gmgn";
import { convertFees } from "../../shared/analysis/fee-rates";
const address = "0xcafdbce93477261db8250e42bdae6e66733f9e20";
const pool = "0x7a907a283ef913eb25bee3afd110f687a3fb7eed";
const now = "2026-09-26T12:00:00.000Z";
const raw = {
  url: `https://gmgn.ai/bsc/token/${address}`,
  tokenLinks: [`https://bscscan.com/token/${address}`],
  poolLinks: [`https://bscscan.com/address/${pool}`],
  info: { "Total Fees": "30" },
  risk: {},
  pool: {},
  tooltips: [],
  volumeText: "",
  volumePeriod: "5m",
  feeIcon: "IconBscbal12px",
  holdersState: "partial",
  holders: [
    {
      address: pool,
      tags: ["bundler"],
      remaining: "$100,000",
      unrealized: "+$20,000\n+1200%",
    },
  ],
};
const read = () => parseGmgnCard(raw, { chain: "bsc", address }, now);
it("reads BSC native fees without pretending BNB is SOL", () => {
  const s = read();
  expect(s.nativeFees?.asset).toBe("BNB");
  expect(gmgnStrategyInput(s).totalFeesSolEquivalent).toBeNull();
});
it("excludes a confirmed pool address from seller rankings without changing aggregates", () => {
  const s = read();
  expect(s.holders?.rows).toHaveLength(1);
  expect(holderPressure(s).byPosition).toHaveLength(0);
});
it("converts 30 BNB to 150 SOL and retains quote timestamps", () => {
  const s = convertFees(
    read(),
    {
      solana: { usd: 120, last_updated_at: Date.parse(now) / 1000 },
      binancecoin: { usd: 600, last_updated_at: Date.parse(now) / 1000 },
    },
    now,
  );
  expect(gmgnStrategyInput(s).totalFeesSolEquivalent).toBe(150);
  expect(s.feeConversion?.usd).toBe(18000);
});
it("leaves stale, invalid or missing exchange rates unknown", () => {
  for (const usd of [0, -1, NaN, undefined])
    expect(
      gmgnStrategyInput(
        convertFees(
          read(),
          { solana: { usd, last_updated_at: Date.parse(now) / 1000 } },
          now,
        ),
      ).totalFeesSolEquivalent,
    ).toBeNull();
  expect(
    gmgnStrategyInput(
      convertFees(
        read(),
        {
          solana: { usd: 120, last_updated_at: 1 },
          binancecoin: { usd: 600, last_updated_at: 1 },
        },
        now,
      ),
    ).totalFeesSolEquivalent,
  ).toBeNull();
});

it("normalizes EVM case while rejecting another chain explorer", () => {
  const mixed = address.slice(0, 2) + address.slice(2).toUpperCase();
  expect(
    parseGmgnCard(
      {
        ...raw,
        url: `https://gmgn.ai/bsc/token/${mixed}`,
        tokenLinks: [`https://bscscan.com/token/${mixed}`],
      },
      { chain: "bsc", address: mixed },
      now,
    ).target.address,
  ).toBe(address);
  expect(() =>
    parseGmgnCard(
      { ...raw, tokenLinks: [`https://solscan.io/token/${address}`] },
      { chain: "bsc", address },
      now,
    ),
  ).toThrow();
});
it("rejects future quotes and excessive pair skew, preserving rounded precision", () => {
  const seconds = Date.parse(now) / 1000;
  for (const offset of [31, -301])
    expect(
      convertFees(
        read(),
        {
          solana: { usd: 120, last_updated_at: seconds + offset },
          binancecoin: { usd: 600, last_updated_at: seconds + offset },
        },
        now,
      ).feeConversion,
    ).toBeUndefined();
  expect(
    convertFees(
      read(),
      {
        solana: { usd: 120, last_updated_at: seconds },
        binancecoin: { usd: 600, last_updated_at: seconds - 121 },
      },
      now,
    ).feeConversion,
  ).toBeUndefined();
  const rounded = parseGmgnCard(
    { ...raw, info: { "Total Fees": "1.2K" } },
    { chain: "bsc", address },
    now,
  );
  expect(
    gmgnStrategyInput(
      convertFees(
        rounded,
        {
          solana: { usd: 120, last_updated_at: seconds },
          binancecoin: { usd: 600, last_updated_at: seconds },
        },
        now,
      ),
    ).totalFeesSolEquivalent,
  ).toBeNull();
});
it("does not exclude arbitrary links or normalize Solana addresses as EVM", () => {
  const s = parseGmgnCard(
    {
      ...raw,
      poolLinks: [`https://evil.test/address/${pool}`],
      holders: [
        {
          address: "F9PvspnWkP3hSLaYxQb2LvFRBgyrLVhdUJ5q39tZZPbC",
          tags: [],
          remaining: "$1",
          unrealized: "$0",
        },
      ],
    },
    { chain: "bsc", address },
    now,
  );
  expect(s.poolAddresses).toEqual([]);
  expect(s.holders?.unidentifiedRows).toBe(1);
});
it("reads Robinhood fees as ETH and validates the Robinhood explorer", () => {
  const input = {
    ...raw,
    url: `https://gmgn.ai/robinhood/token/${address}`,
    tokenLinks: [`https://robin.etherscan.io/token/${address}#code`],
    poolLinks: [],
    feeIcon: "IconRobinhoodeth16pxS",
  };
  const s = parseGmgnCard(input, { chain: "robinhood", address }, now);
  expect(s.nativeFees?.asset).toBe("ETH");
  expect(s.nativeFees?.amount.value).toBe(30);
  expect(() =>
    parseGmgnCard(
      { ...input, tokenLinks: [`https://etherscan.io/token/${address}`] },
      { chain: "robinhood", address },
      now,
    ),
  ).toThrow();
});
