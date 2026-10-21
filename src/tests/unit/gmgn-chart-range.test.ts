import { expect, it } from "vitest";
import {
  parseGmgnAllTimeCandleVolume,
  readGmgnAllTimeVolume,
} from "../../main/services/gmgn-chart-range";

const address = "F9PvspnWkP3hSLaYxQb2LvFRBgyrLVhdUJ5q39tZZPbC";
const target = { chain: "sol" as const, address };
it("sums only completed, canonical GMGN candles for the all-time volume", () => {
  const observed = "2025-10-15T00:03:00.000Z";
  const completed = Math.floor(Date.parse(observed) / 1000 / 60) * 60;
  expect(
    parseGmgnAllTimeCandleVolume(
      {
        url: `https://gmgn.ai/sol/token/${address}`,
        tokenAddress: address,
        resolution: "1m",
        limit: 500,
        data: {
          _debug_tpool: { base_address: address },
          list: [
            { time: completed * 1000, volume: "999" },
            { time: (completed - 120) * 1000, volume: "125.25" },
            { time: (completed - 60) * 1000, volume: 250.5 },
          ],
        },
      },
      target,
      observed,
    ),
  ).toMatchObject({
    volumeUsd: { value: 375.75, precision: "display" },
    firstCompletedEpochSeconds: completed - 120,
    latestCompletedEpochSeconds: completed - 60,
    candleSeconds: 60,
  });
});

it("rejects potentially truncated, mismatched, or open GMGN candle ranges", () => {
  const observed = "2025-10-15T00:03:00.000Z";
  const completed = Math.floor(Date.parse(observed) / 1000 / 60) * 60;
  const base = {
    url: `https://gmgn.ai/sol/token/${address}`,
    tokenAddress: address,
    resolution: "1m",
    limit: 3,
    data: {
      _debug_tpool: { base_address: address },
      list: [
        { time: (completed - 180) * 1000, volume: "1" },
        { time: (completed - 120) * 1000, volume: "2" },
        { time: (completed - 60) * 1000, volume: "3" },
      ],
    },
  };
  expect(parseGmgnAllTimeCandleVolume(base, target, observed)).toBeNull();
  expect(
    parseGmgnAllTimeCandleVolume(
      { ...base, limit: 500, tokenAddress: "other" },
      target,
      observed,
    ),
  ).toBeNull();
  expect(
    parseGmgnAllTimeCandleVolume(
      {
        ...base,
        limit: 500,
        data: {
          ...base.data,
          list: [{ time: completed * 1000, volume: "1" }],
        },
      },
      target,
      observed,
    ),
  ).toBeNull();
});

it("falls back to the next GMGN chart resolution after a failed request", async () => {
  const observed = "2025-10-15T00:03:00.000Z";
  const completed = Math.floor(Date.parse(observed) / 1000 / 300) * 300;
  let calls = 0;
  await expect(
    readGmgnAllTimeVolume(async () => {
      calls++;
      if (calls === 1) throw new Error("1m unavailable");
      return {
        url: `https://gmgn.ai/sol/token/${address}`,
        tokenAddress: address,
        resolution: "5m",
        limit: 500,
        data: {
          _debug_tpool: { base_address: address },
          list: [{ time: (completed - 300) * 1000, volume: "1234" }],
        },
      };
    }, target, observed),
  ).resolves.toMatchObject({ volumeUsd: { value: 1234 } });
  expect(calls).toBe(2);
});
