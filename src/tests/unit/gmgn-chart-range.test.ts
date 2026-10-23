import { expect, it } from "vitest";
import {
  gmgnChartRequestUrl,
  gmgnAllTimeCandlesScript,
  gmgnSessionQueryParameters,
  parseGmgnAllTimeCandleVolume,
  readGmgnAllTimeVolume,
} from "../../main/services/gmgn-chart-range";

const address = "F9PvspnWkP3hSLaYxQb2LvFRBgyrLVhdUJ5q39tZZPbC";
const target = { chain: "sol" as const, address };

it("reuses GMGN's session query parameters from a same-origin API request", () => {
  expect(
    gmgnSessionQueryParameters([
      "https://example.test/api/v1/token_holders/sol/x?device_id=wrong",
      "https://gmgn.ai/vas/api/v1/token_holders/sol/x?device_id=device&fp_did=fingerprint&client_id=web&from_app=gmgn&app_ver=1.2.3&tz_name=Europe%2FMoscow&tz_offset=180&app_lang=ru&os=windows&pool_type=tpool&tab_id=tab&worker=0&ignored=secret",
    ]),
  ).toEqual({
    device_id: "device",
    fp_did: "fingerprint",
    client_id: "web",
    from_app: "gmgn",
    app_ver: "1.2.3",
    tz_name: "Europe/Moscow",
    tz_offset: "180",
    app_lang: "ru",
    os: "windows",
    pool_type: "tpool",
    tab_id: "tab",
    worker: "0",
  });
});

it("keeps the exact GMGN chart request for the active token", () => {
  const chartUrl = `https://gmgn.ai/api/v1/token_mcap_candles/sol/${address}?device_id=device&pool_type=tpool&tab_id=tab&worker=0&resolution=1m&limit=501`;
  expect(
    gmgnChartRequestUrl(
      [
        "https://gmgn.ai/api/v1/token_mcap_candles/sol/other?pool_type=tpool",
        chartUrl,
      ],
      target,
    ),
  ).toBe(chartUrl);
  expect(
    gmgnChartRequestUrl(
      ["https://gmgn.ai/api/v1/token_mcap_candles/sol/other?pool_type=tpool"],
      target,
    ),
  ).toBeNull();
});

it("prefers session parameters captured during GMGN page loading", () => {
  const chartUrl = `https://gmgn.ai/api/v1/token_mcap_candles/sol/${address}?device_id=device&pool_type=tpool&tab_id=tab&worker=0&resolution=1m&limit=501`;
  const script = gmgnAllTimeCandlesScript(
    target,
    "1h",
    {
      device_id: "captured-device",
      fp_did: "captured-fingerprint",
    },
    chartUrl,
  );
  expect(script).toContain(
    'const capturedSessionParameters={"device_id":"captured-device","fp_did":"captured-fingerprint"};',
  );
  expect(script).toContain("capturedSessionParameters[key]||");
  expect(script).toContain(JSON.stringify(chartUrl));
  expect(script).toContain('"pool_type"');
  expect(script).toContain("'limit',501");
});
it("sums only completed, canonical GMGN candles for the all-time volume", () => {
  const observed = "2025-10-15T00:03:00.000Z";
  const completed = Math.floor(Date.parse(observed) / 1000 / 60) * 60;
  expect(
    parseGmgnAllTimeCandleVolume(
      {
        url: `https://gmgn.ai/sol/token/${address}`,
        tokenAddress: address,
        resolution: "1m",
        limit: 501,
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

it("accepts GMGN's successful candle-response envelope", () => {
  const observed = "2025-10-15T00:03:00.000Z";
  const completed = Math.floor(Date.parse(observed) / 1000 / 60) * 60;
  expect(
    parseGmgnAllTimeCandleVolume(
      {
        url: `https://gmgn.ai/sol/token/${address}`,
        tokenAddress: address,
        resolution: "1m",
        limit: 501,
        data: {
          code: 0,
          reason: "",
          message: "success",
          data: {
            _debug_tpool: { base_address: address },
            list: [{ time: (completed - 60) * 1000, volume: "321" }],
          },
        },
      },
      target,
      observed,
    ),
  ).toMatchObject({ volumeUsd: { value: 321 } });
});

it("sums a complete paginated GMGN candle history", () => {
  const observed = "2025-10-15T00:03:00.000Z";
  const completed = Math.floor(Date.parse(observed) / 1000 / 86_400) * 86_400;
  expect(
    parseGmgnAllTimeCandleVolume(
      {
        url: `https://gmgn.ai/sol/token/${address}`,
        tokenAddress: address,
        resolution: "1d",
        limit: 501,
        complete: true,
        data: {
          _debug_tpool: { base_address: address },
          list: [{ time: (completed - 86_400) * 1000, volume: "5" }],
        },
        pages: [
          {
            _debug_tpool: { base_address: address },
            list: [{ time: (completed - 86_400) * 1000, volume: "5" }],
          },
          {
            _debug_tpool: { base_address: address },
            list: [{ time: (completed - 172_800) * 1000, volume: "7.5" }],
          },
        ],
      },
      target,
      observed,
    ),
  ).toMatchObject({ volumeUsd: { value: 12.5 } });
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
        limit: 501,
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
  const scripts: string[] = [];
  await expect(
    readGmgnAllTimeVolume(
      async (script) => {
        scripts.push(script);
        if (scripts.length === 1) throw new Error("1d unavailable");
        return {
          url: `https://gmgn.ai/sol/token/${address}`,
          tokenAddress: address,
          resolution: "4h",
          limit: 501,
          data: {
            _debug_tpool: { base_address: address },
            list: [{ time: (completed - 14_400) * 1000, volume: "1234" }],
          },
        };
      },
      target,
      observed,
    ),
  ).resolves.toMatchObject({ volumeUsd: { value: 1234 } });
  expect(scripts).toHaveLength(2);
  expect(scripts[0]).toContain('set(\'resolution\',"1d")');
  expect(scripts[1]).toContain('set(\'resolution\',"4h")');
});
