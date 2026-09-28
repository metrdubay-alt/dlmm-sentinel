import { expect, it } from "vitest";
import {
  defaultNumericProfiles,
  numericProfilesSchema,
  profileTone,
  formatTokenAge,
} from "../../shared/analysis/numeric-profiles";
it("starts with runner/slowcook thresholds and hourly volume x12", () => {
  const [r, s] = defaultNumericProfiles();
  expect(profileTone(r, "volume5mUsd", 49000).redFlag).toBe(true);
  expect(profileTone(s, "volume5mUsd", 30000).kind).toBe("bad");
  expect(profileTone(r, "volume1hUsd", 1200012).kind).toBe("good");
  expect(profileTone(r, "top10Pct", 22).redFlag).toBe(true);
  expect(profileTone(r, "combinedPct", 50).redFlag).toBe(false);
});
it("custom thresholds change flags and colours, missing values stay neutral", () => {
  const [r] = defaultNumericProfiles();
  r.rules.bundlersPct.green = 5;
  r.rules.bundlersPct.red = 8;
  expect(profileTone(r, "bundlersPct", 9).kind).toBe("bad");
  expect(profileTone(r, "bundlersPct", null).kind).toBe("neutral");
  expect(profileTone(r, "bundlersPct", 2).strength).toBeGreaterThan(
    profileTone(r, "bundlersPct", 4).strength,
  );
});
it("keeps cap dependent holders and rejects reversed/duplicate profiles", () => {
  const p = defaultNumericProfiles();
  expect(
    profileTone(p[0], "holderCount", 1500, { marketCapUsd: 2000000 }).redFlag,
  ).toBe(true);
  expect(
    profileTone(p[0], "holderCount", 1500, { marketCapUsd: 400000 }).redFlag,
  ).toBe(false);
  expect(numericProfilesSchema.safeParse([...p, p[0]]).success).toBe(false);
  p[0].rules.bundlersPct.red = 2;
  expect(numericProfilesSchema.safeParse(p).success).toBe(false);
});

it("formats token age without treating missing creation time as zero", () => {
  expect(formatTokenAge(null)).toBe("Нет данных");
  expect(formatTokenAge(5.5)).toBe("5 д. 12 ч.");
  expect(formatTokenAge(1 / 24)).toBe("1 ч. 0 мин.");
});
