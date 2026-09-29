import { describe, expect, it } from "vitest";
import {
  parseMoniCard,
  parseMoniProfileResponse,
  compareMoni,
  moniHandleSchema,
  allowedMoniNavigation,
} from "../../shared/analysis/moni";

const card = {
  url: "https://app.moni.ai/ArtificiallyInu",
  profileHref: "https://x.com/ArtificiallyInu",
  scoreText: "2180",
  smartsText: "183",
  smartHrefs: ["/blknoiz06", "/DeeZe"],
};
const time = "2026-09-25T16:06:00.000Z";
const read = (patch = {}) =>
  parseMoniCard({ ...card, ...patch }, "ArtificiallyInu", time);
it("reads only an exact matching loaded profile response, never substitutes another account or missing score", () => {
  expect(
    parseMoniProfileResponse(
      { username: "beffjezos", score: 10949, smartFollowersCount: 811 },
      "beffjezos",
      time,
    ).score,
  ).toBe(10949);
  expect(() =>
    parseMoniProfileResponse(
      { username: "other", score: 10949 },
      "beffjezos",
      time,
    ),
  ).toThrow();
  expect(() =>
    parseMoniProfileResponse(
      { username: "beffjezos", score: null },
      "beffjezos",
      time,
    ),
  ).toThrow();
});

describe("Moni visible card", () => {
  it("reads exact provider values without converting score to percent", () => {
    expect(read()).toMatchObject({
      handle: "artificiallyinu",
      score: 2180,
      smarts: 183,
      listComplete: false,
      observedAt: time,
      visibleSmarts: ["blknoiz06", "deeze"],
    });
  });
  it("rejects sample redirects and mismatching profile headers", () => {
    expect(() => read({ url: "https://app.moni.ai/getmoni_io" })).toThrow();
    expect(() => read({ profileHref: "https://x.com/getmoni_io" })).toThrow();
    expect(() =>
      read({ profileHref: "https://evil.test/ArtificiallyInu" }),
    ).toThrow();
  });
  it.each(["2.18K", "2180.5", "", "2180 points", "-1", "9007199254740992"])(
    "rejects inexact score %s",
    (scoreText) => {
      expect(() => read({ scoreText })).toThrow();
    },
  );
  it("missing smarts remains unknown, exact zero remains zero", () => {
    expect(read({ smartsText: "" }).smarts).toBeNull();
    expect(read({ smartsText: "0", smartHrefs: [] }).smarts).toBe(0);
  });
  it("deduplicates rows but does not infer a complete list", () => {
    expect(
      read({ smartsText: "1", smartHrefs: ["/DeeZe", "/deeze"] }),
    ).toMatchObject({ visibleSmarts: ["deeze"], listComplete: false });
  });
  it("rejects unsafe profile input and navigation", () => {
    expect(moniHandleSchema.parse(" @ArtificiallyInu ")).toBe(
      "artificiallyinu",
    );
    for (const value of ["../evil", "a?b", "https://x.com/test", ""])
      expect(moniHandleSchema.safeParse(value).success).toBe(false);
    expect(allowedMoniNavigation("https://app.moni.ai/ArtificiallyInu")).toBe(
      true,
    );
    expect(allowedMoniNavigation("https://profile.moni.ai/")).toBe(true);
    for (const url of [
      "https://moni.ai.evil.test/",
      "https://user:pass@app.moni.ai/",
      "http://app.moni.ai/",
      "file:///secret",
      "https://app.moni.ai:444/",
    ])
      expect(allowedMoniNavigation(url)).toBe(false);
  });
  it("score drop is a signal to verify, not an unfollow claim", () => {
    const older = read();
    const newer = {
      ...older,
      score: 2000,
      visibleSmarts: [],
      observedAt: "2026-09-25T17:06:00.000Z",
    };
    expect(compareMoni(newer, older)).toMatchObject({
      scoreDelta: -180,
      needsReview: true,
    });
    expect(compareMoni(newer, undefined).scoreDelta).toBeNull();
    expect(
      compareMoni(newer, { ...older, handle: "other" }).scoreDelta,
    ).toBeNull();
    expect(compareMoni(older, newer).scoreDelta).toBeNull();
  });
});

it("identifies a missing requested profile without calling it quota exhaustion", () => {
  expect(() =>
    read({ profileHref: "", scoreText: "", notFound: true }),
  ).toThrow("GetMoni: профиль @artificiallyinu не найден.");
});
