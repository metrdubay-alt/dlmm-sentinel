import { expect, it } from "vitest";
import { parseGmgnAllTimeVolume } from "../../main/services/gmgn-chart-range";

const address = "F9PvspnWkP3hSLaYxQb2LvFRBgyrLVhdUJ5q39tZZPbC";
const target = { chain: "sol" as const, address };
const observedAt = "2026-10-15T00:10:00.000Z";
const valid = {
  url: `https://gmgn.ai/sol/token/${address}`,
  tokenAddress: address,
  fullRange: true,
  firstCompletedEpochSeconds: 1_760_485_200,
  latestCompletedEpochSeconds: 1_760_486_000,
  candleSeconds: 300,
  volumeText: "$13.9M",
};

it("keeps a canonical GMGN full-range volume with its completed bounds", () => {
  expect(parseGmgnAllTimeVolume(valid, target, observedAt)).toMatchObject({
    volumeUsd: { value: 13_900_000, precision: "rounded" },
    firstCompletedEpochSeconds: valid.firstCompletedEpochSeconds,
    latestCompletedEpochSeconds: valid.latestCompletedEpochSeconds,
  });
});

it("rejects an overlay from another token or a non-full range", () => {
  expect(
    parseGmgnAllTimeVolume(
      { ...valid, tokenAddress: "other" },
      target,
      observedAt,
    ),
  ).toBeNull();
  expect(
    parseGmgnAllTimeVolume({ ...valid, fullRange: false }, target, observedAt),
  ).toBeNull();
});

it("rejects a range whose final candle is still open", () => {
  expect(
    parseGmgnAllTimeVolume(
      {
        ...valid,
        latestCompletedEpochSeconds: Date.parse(observedAt) / 1000 - 60,
      },
      target,
      observedAt,
    ),
  ).toBeNull();
});
