import { expect, it } from "vitest";
import {
  followingOverlapHint,
  hasNoXAccount,
} from "../../renderer/lib/following-overlap-hint";

it("explains that the token has no X account when Grok completed without one", () => {
  const result = {
    handle: null,
    answer: { discoveredProfile: null },
    followingOverlap: undefined,
  };
  expect(followingOverlapHint(result)).toBe("Акк в X отсутствует");
  expect(hasNoXAccount(result)).toBe(true);
});

it("does not hide an unavailable overlap check as an absent X account", () => {
  expect(
    hasNoXAccount({
      handle: "project",
      answer: { discoveredProfile: { handle: "project", sources: [] } },
      followingOverlap: {
        state: "unavailable",
        message: "Войдите в X в приложении.",
        observedAt: "2026-10-12T21:00:00.000Z",
      },
    }),
  ).toBe(false);
});
