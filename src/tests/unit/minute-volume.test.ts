import { expect, it } from "vitest";
import {
  minuteVolumeSnapshot,
  parseSolQuote,
  minimumMinuteVolume,
} from "../../shared/analysis/minute-volume";
import {
  defaultNumericProfiles,
  numericProfilesSchema,
  profileTone,
} from "../../shared/analysis/numeric-profiles";
const now = Date.parse("2026-10-02T13:30:45Z");
const end = Math.floor(now / 60000) * 60;
const quote = {
  usd: 100,
  observedAt: "2026-10-02T13:30:40Z",
  source: "Coinbase" as const,
};
const raw = (volumes: number[]) => ({
  code: 0,
  data: {
    list: volumes.map((volume, i) => ({
      time: (end - 300 + i * 60) * 1000,
      volume: String(volume),
    })),
  },
});
it("uses exactly five completed aligned minutes, not the open candle or five-minute average", () => {
  const result = minuteVolumeSnapshot(
    raw([19900, 20000, 30000, 30100, 50000, 999999]),
    now,
    quote,
  );
  expect(result.candles.map((c) => c.volumeSol)).toEqual([
    199, 200, 300, 301, 500,
  ]);
  expect(result.candles.map((c) => c.time)).toEqual([
    end - 300,
    end - 240,
    end - 180,
    end - 120,
    end - 60,
  ]);
  expect(minimumMinuteVolume(result)).toBe(199);
});
it("does not turn missing, duplicated, invalid or stale data into zero or a passing result", () => {
  const gap = raw([100, 200, 300, 400, 500]);
  gap.data.list.splice(2, 1);
  const missing = minuteVolumeSnapshot(gap, now, quote);
  expect(missing.candles[2].volumeSol).toBeNull();
  expect(minimumMinuteVolume(missing)).toBeNull();
  const duplicate = raw([100, 200, 300, 400, 500]);
  duplicate.data.list.push({ ...duplicate.data.list[0], volume: "999" });
  expect(
    minuteVolumeSnapshot(duplicate, now, quote).candles[0].volumeSol,
  ).toBeNull();
  expect(
    minuteVolumeSnapshot(
      { code: 429, data: { list: [] } },
      now,
      quote,
    ).candles.every((c) => c.volumeSol === null),
  ).toBe(true);
  expect(
    minuteVolumeSnapshot(raw([0, 1, 2, 3, 4]), now, null).candles[0].volumeSol,
  ).toBeNull();
  expect(
    minuteVolumeSnapshot(raw([0, 1, 2, 3, 4]), now, quote).candles[0].volumeSol,
  ).toBe(0);
  expect(
    parseSolQuote({ price: "100", time: "2026-10-02T12:00:00Z" }, now),
  ).toBeNull();
  expect(parseSolQuote({ price: "0", time: quote.observedAt }, now)).toBeNull();
  expect(
    parseSolQuote({ price: "100", time: quote.observedAt }, now)?.usd,
  ).toBe(100);
});
it("adds runner-only default thresholds to old profiles while preserving custom settings", () => {
  const profiles = defaultNumericProfiles();
  const old = profiles.map((p) => {
    const { minuteVolumeSol: unused, ...rules } = p.rules;
    void unused;
    return { ...p, rules };
  });
  old[0].rules.top10Pct.green = 7;
  const migrated = numericProfilesSchema.parse(old);
  expect(migrated[0].rules.top10Pct.green).toBe(7);
  expect(migrated[0].rules.minuteVolumeSol.enabled).toBe(true);
  expect(migrated[1].rules.minuteVolumeSol.enabled).toBe(false);
  expect(
    [199.99, 200, 300, 300.01].map(
      (v) => profileTone(migrated[0], "minuteVolumeSol", v).kind,
    ),
  ).toEqual(["bad", "neutral", "neutral", "good"]);
  expect(profileTone(migrated[1], "minuteVolumeSol", 100).kind).toBe("neutral");
});
