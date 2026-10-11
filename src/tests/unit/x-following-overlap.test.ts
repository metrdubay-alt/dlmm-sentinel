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

const completePayload = {
  url: "https://x.com/example/followers",
  identity: "Example\n@example",
  signedOut: false,
  followingTotal: "210 Following",
  matchedFollowing: 13,
  complete: true,
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

it("parses a complete visible X sample only after its end is explicit", () => {
  expect(
    parseXFollowingOverlapPayload(completePayload, "example", at),
  ).toMatchObject({
    state: "complete",
    followingTotal: 210,
    matchedFollowing: 13,
  });
  expect(
    parseXFollowingOverlapPayload(
      { ...completePayload, complete: false },
      "example",
      at,
    ),
  ).toMatchObject({ state: "incomplete" });
});

it("does not count a signed-out page or a page for another profile", () => {
  expect(
    parseXFollowingOverlapPayload(
      { ...completePayload, signedOut: true },
      "example",
      at,
    ),
  ).toMatchObject({ state: "unavailable" });
  expect(
    parseXFollowingOverlapPayload(
      { ...completePayload, identity: "Else\n@else" },
      "example",
      at,
    ),
  ).toMatchObject({ state: "unavailable" });
});
