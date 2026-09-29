import { it, expect } from "vitest";
import { connectionFromEvidence } from "../../shared/analysis/connections";
const e = { signedIn: false, signedOut: false, notice: "", challenge: false };
it("does not equate an open page with authentication", () =>
  expect(connectionFromEvidence(e).auth).toBe("unknown"));
it("signout overrides old positive controls", () =>
  expect(
    connectionFromEvidence({ ...e, signedIn: true, signedOut: true }).auth,
  ).toBe("signed-out"));
it("quota is independent from authentication", () =>
  expect(
    connectionFromEvidence({
      ...e,
      signedIn: true,
      notice: "You have reached your daily limit",
    }),
  ).toMatchObject({ auth: "signed-in", limit: expect.any(String) }));
it("does not claim quota recovery by elapsed time or invent a reset time", () => {
  expect(
    connectionFromEvidence({ ...e, notice: "Лимит исчерпан" }).limit,
  ).toBeTruthy();
  expect(
    connectionFromEvidence({ ...e, notice: "Daily limit 5" }).limit,
  ).toBeNull();
});

it("reads confirmed Moni usage and flags only exhausted windows", () => {
  const usage = { dailyUsedPercent: 2, weeklyUsedPercent: 3 };
  expect(connectionFromEvidence({ ...e, usage })).toMatchObject({
    limit: null,
    usage,
  });
  expect(
    connectionFromEvidence({
      ...e,
      usage: { dailyUsedPercent: 100, weeklyUsedPercent: 3 },
    }).limit,
  ).toContain("Дневной лимит GetMoni исчерпан");
  expect(
    connectionFromEvidence({
      ...e,
      usage: { dailyUsedPercent: null, weeklyUsedPercent: 100 },
    }).limit,
  ).toContain("Недельный лимит GetMoni исчерпан");
});
it("does not mistake 10 remaining searches for zero remaining searches", () => {
  expect(
    connectionFromEvidence({ ...e, notice: "10 searches remaining" }).limit,
  ).toBeNull();
});
