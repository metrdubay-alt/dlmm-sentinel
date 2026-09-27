import { expect, it } from "vitest";
import {
  parseXProfile,
  compareXProfiles,
} from "../../shared/analysis/x-browser";
const at = "2026-09-26T14:00:00.000Z";
const raw = {
  url: "https://x.com/Gstockbsc",
  identity: "Gstock\n@Gstockbsc",
  bio: "CA: 0xcafdbce93477261db8250e42bdae6e66733f9e20",
  followers: "4,013 Followers",
  following: "1,664 Following",
  joined: "Joined February 2012",
  website: "https://gstocks.meme",
  posts: [
    {
      url: "https://x.com/Gstockbsc/status/2103650927358185491",
      author: "Gstockbsc",
      text: "Claim rewards",
      publishedAt: "2026-09-26T01:00:00.000Z",
    },
  ],
  unavailableText: "",
};
it("captures a candidate profile and distinguishes incomplete visible activity", () => {
  const s = parseXProfile(raw, "gstockbsc", at);
  expect(s.followers).toBe(4013);
  expect(s.coverage).toBe("visible-sample");
  expect(s.posts).toHaveLength(1);
  expect(s.official).toBe(false);
});
it("rejects login, another profile and spoofed origin without claiming deletion", () => {
  for (const url of [
    "https://x.com/i/flow/login",
    "https://x.com/another",
    "https://x.com.evil.test/Gstockbsc",
  ])
    expect(() => parseXProfile({ ...raw, url }, "gstockbsc", at)).toThrow();
  expect(() =>
    parseXProfile(
      { ...raw, identity: "", unavailableText: "Try again" },
      "gstockbsc",
      at,
    ),
  ).toThrow();
});
it("keeps rounded follower counts unknown and quotes out of authored posts", () => {
  const s = parseXProfile(
    {
      ...raw,
      followers: "4K Followers",
      posts: [{ ...raw.posts[0], author: "someoneelse" }],
    },
    "gstockbsc",
    at,
  );
  expect(s.followers).toBeNull();
  expect(s.posts).toHaveLength(0);
});
it("reports an explicit unavailable profile without asserting deletion", () => {
  const old = parseXProfile(raw, "gstockbsc", at);
  const s = parseXProfile(
    {
      ...raw,
      identity: "",
      unavailableText: "This account doesn’t exist",
      posts: [],
    },
    "gstockbsc",
    "2026-09-26T14:05:00.000Z",
  );
  expect(s.state).toBe("unavailable");
  expect(compareXProfiles(s, old).some((x) => x.code === "X_UNAVAILABLE")).toBe(
    true,
  );
});
it("compares only matching handles and reports follower decline with observation times", () => {
  const old = parseXProfile(raw, "gstockbsc", at);
  const s = parseXProfile(
    { ...raw, followers: "3,000 Followers" },
    "gstockbsc",
    "2026-09-26T14:05:00.000Z",
  );
  expect(
    compareXProfiles(s, old).some((x) => x.code === "X_FOLLOWERS_DOWN"),
  ).toBe(true);
  expect(compareXProfiles(s, { ...old, handle: "another" })).toEqual([]);
});

it("parses space-grouped counts completely and rejects malformed groups", () => {
  for (const followers of [
    "1 234 Followers",
    "1\u00a0234 Followers",
    "1\u202f234 Followers",
  ])
    expect(
      parseXProfile({ ...raw, followers }, "gstockbsc", at).followers,
    ).toBe(1234);
  expect(
    parseXProfile({ ...raw, followers: "1 23 Followers" }, "gstockbsc", at)
      .followers,
  ).toBeNull();
});
