import { expect, it } from "vitest";
import {
  parseXFollowingOverlapPayload,
  xFollowingOverlapSchema,
} from "../../shared/analysis/x-following-overlap";

const at = "2026-10-11T20:00:00.000Z";
const complete = {
  state: "complete",
  targetHandle: "example",
  sourceUrl: "https://x.com/example/followers",
  observedAt: at,
  followingTotal: 210,
  matchedFollowing: 13,
};

it("accepts a complete intersection but rejects counts beyond the following total", () => {
  expect(xFollowingOverlapSchema.parse(complete)).toMatchObject(complete);
  expect(() =>
    xFollowingOverlapSchema.parse({ ...complete, matchedFollowing: 211 }),
  ).toThrow();
});

it("keeps incomplete X data non-numeric instead of fabricating zero", () => {
  expect(
    xFollowingOverlapSchema.parse({
      state: "incomplete",
      observedAt: at,
      message: "X показал неполный список.",
    }),
  ).toMatchObject({ state: "incomplete" });
  expect(() =>
    xFollowingOverlapSchema.parse({
      state: "incomplete",
      observedAt: at,
      message: "X показал неполный список.",
      matchedFollowing: 0,
    }),
  ).toThrow();
});

it("turns an incomplete DOM payload into an explicit non-numeric state", () => {
  expect(
    parseXFollowingOverlapPayload(
      {
        url: "https://x.com/example/followers",
        identity: "Example\n@example",
        signedOut: false,
        followingTotal: "210 Following",
        matchedFollowing: 13,
        complete: false,
      },
      "example",
      at,
    ),
  ).toMatchObject({ state: "incomplete" });
});
