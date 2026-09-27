import { expect, it } from "vitest";
import { summarizeSocial } from "../../shared/analysis/social-summary";
import type { XProfile } from "../../shared/analysis/x-browser";
const target = {
  chain: "bsc" as const,
  address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
};
const profile: XProfile = {
  handle: "example",
  sourceUrl: "https://x.com/example",
  observedAt: "2026-09-26T15:00:00.000Z",
  state: "available",
  official: false,
  bio: `CA ${target.address}`,
  website: "example.meme",
  joined: "Joined February 2012",
  followers: 4000,
  following: 20,
  coverage: "visible-sample",
  unavailableText: "",
  posts: [
    {
      author: "example",
      url: "https://x.com/example/status/123",
      text: "Rewards distributed: 88 BNB. Claim at https://other.test",
      publishedAt: "2026-09-26T10:00:00.000Z",
    },
  ],
};
it("turns claims into sourced verification tasks without certifying payouts or a scam", () => {
  const s = summarizeSocial(
    profile,
    target,
    Date.parse("2026-09-26T15:00:00Z"),
  );
  expect(s.addressInBio).toBe(true);
  expect(s.signals.map((x) => x.code)).toEqual(
    expect.arrayContaining(["CLAIM_LANGUAGE", "ECONOMIC_CLAIM"]),
  );
  expect(s.signals.find((x) => x.code === "ECONOMIC_CLAIM")?.sources).toEqual([
    profile.posts[0].url,
  ]);
  expect(s.domains.map((x) => x.host)).toEqual(["example.meme", "other.test"]);
  expect(s.activity).toEqual({
    visible7d: 1,
    visible30d: 1,
    undated: 0,
    future: 0,
  });
  expect(s.complete).toBe(false);
});
it("does not infer bots, account sale or endorsement from age and followers", () => {
  const s = summarizeSocial(
    { ...profile, posts: [] },
    target,
    Date.parse(profile.observedAt),
  );
  expect(s.signals).toEqual([]);
  expect(s.activity.visible7d).toBe(0);
  expect(s.complete).toBe(false);
});
it("counts only unique own posts, ignores future dates and rejects unsafe source URLs", () => {
  const p = profile.posts[0];
  const s = summarizeSocial(
    {
      ...profile,
      posts: [
        p,
        p,
        { ...p, author: "other", url: "https://x.com/other/status/2" },
        {
          ...p,
          url: "https://x.com/example/status/3",
          publishedAt: "2026-09-27T00:00:00Z",
        },
        { ...p, url: "https://x.com.evil.test/example/status/4" },
      ],
    },
    target,
    Date.parse(profile.observedAt),
  );
  expect(s.activity.visible7d).toBe(1);
  expect(s.activity.future).toBe(1);
  expect(s.signals.flatMap((x) => x.sources)).not.toContain(
    "https://x.com.evil.test/example/status/4",
  );
});
it("distinguishes unavailable profile and missing data from deleted account", () => {
  expect(summarizeSocial(null, target, Date.now()).status).toBe("missing");
  expect(
    summarizeSocial(
      { ...profile, state: "unavailable" },
      target,
      Date.parse(profile.observedAt),
    ).status,
  ).toBe("unavailable");
});
it("keeps historical activity anchored to the explicitly labelled capture date", () => {
  const s = summarizeSocial(
    profile,
    target,
    Date.parse("2026-11-01T00:00:00Z"),
  );
  expect(s.activity.visible7d).toBe(1);
  expect(s.activity.visible30d).toBe(1);
});
it("matches the full chain-sensitive contract, not a prefix or another token", () => {
  expect(
    summarizeSocial(
      { ...profile, bio: `${target.address}abcd` },
      target,
      Date.parse(profile.observedAt),
    ).addressInBio,
  ).toBe(false);
  expect(
    summarizeSocial(
      { ...profile, bio: target.address.toUpperCase() },
      target,
      Date.parse(profile.observedAt),
    ).addressInBio,
  ).toBe(true);
});
