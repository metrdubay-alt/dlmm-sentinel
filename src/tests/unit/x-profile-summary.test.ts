// @vitest-environment happy-dom
import { expect, it } from "vitest";
import {
  parseXProfileSummary,
  xProfileSummaryScript,
} from "../../main/services/x-profile-summary";
const at = "2026-10-27T12:00:00.000Z";
const base = {
  url: "https://x.com/ORE",
  identity: "ORE @ORE",
  template: "",
  zero: false,
};
it.each([
  ["В читаемых у §, § и еще 7 пользователей, которых вы читаете", 9],
  ["В читаемых у §, § и ещё 7 пользователей, которых вы читаете", 9],
  ["Followed by §, §, and 7 others you follow", 9],
  ["Followed by § and §", 2],
  ["Followed by §", 1],
])("counts only the dedicated summary: %s", (template, n) => {
  expect(
    parseXProfileSummary({ ...base, template }, "ore", "37 Following", at),
  ).toMatchObject({
    state: "complete",
    matchedFollowing: n,
    followingTotal: 37,
  });
});
it("preserves unknown and rejects another profile or impossible totals", () => {
  expect(parseXProfileSummary(base, "ore", "37 Following", at)).toBeNull();
  expect(
    parseXProfileSummary(
      { ...base, template: "Followed by §", url: "https://x.com/other" },
      "ore",
      "37 Following",
      at,
    ),
  ).toBeNull();
  expect(
    parseXProfileSummary(
      { ...base, template: "Followed by § and 80 others you follow" },
      "ore",
      "37 Following",
      at,
    ),
  ).toBeNull();
  expect(
    parseXProfileSummary({ ...base, zero: true }, "ore", "37 Following", at),
  ).toMatchObject({ matchedFollowing: 0 });
});
it("reads names as DOM nodes, including commas inside names; ignores tweets", async () => {
  (
    window as unknown as { happyDOM: { setURL(s: string): void } }
  ).happyDOM.setURL(base.url);
  document.body.innerHTML =
    '<main data-testid="primaryColumn"><div data-testid="UserName">ORE @ORE</div><a href="/ORE/followers_you_follow"><div dir="ltr">В читаемых у <span><span>Alice, trader</span></span>, <span>Frank</span> и еще 7 пользователей, которых вы читаете</div></a><article>Not followed by anyone you’re following</article></main>';
  const raw = await window.eval(xProfileSummaryScript("ore"));
  expect(parseXProfileSummary(raw, "ore", "37 Following", at)).toMatchObject({
    matchedFollowing: 9,
  });
});
