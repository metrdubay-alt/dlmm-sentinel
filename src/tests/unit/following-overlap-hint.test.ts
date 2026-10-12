import { expect, it } from "vitest";
import { followingOverlapHint } from "../../renderer/lib/following-overlap-hint";

it("explains that the token has no X account when Grok completed without one", () => {
  expect(
    followingOverlapHint({
      handle: null,
      answer: { discoveredProfile: null },
      followingOverlap: undefined,
    }),
  ).toBe("Акк в X отсутствует");
});
