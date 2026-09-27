import { expect, it, vi } from "vitest";
import { fetchXResearch, xHandle } from "../../main/providers/x-research";
import { normalizeDex } from "../../main/providers/normalize";
import { LiveHttp } from "../../main/providers/http";
const mint = "So11111111111111111111111111111111111111112";
it("a 200 error envelope is not zero activity", async () => {
  const f = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async (u) =>
        new Response(
          JSON.stringify(
            String(u).includes("/by/username/")
              ? { data: { id: "42", username: "hyena" } }
              : String(u).includes("/users/42/tweets")
                ? { errors: [{ title: "Unavailable" }], meta: {} }
                : { meta: { result_count: 0 } },
          ),
        ),
    );
  const r = await fetchXResearch(
    new LiveHttp(f, 0),
    mint,
    "key",
    "quick",
    AbortSignal.timeout(8000),
    ["https://x.com/hyena"],
  );
  expect(r.details.xProfiles?.[0].observed7d).toBeUndefined();
  expect(r.details.xProfiles?.[0].timelineComplete).toBe(false);
});
it("only exact profile paths on X/Twitter become candidates", () => {
  expect(xHandle("https://x.com/hyENAstonk")).toBe("hyenastonk");
  for (const u of [
    "https://x.com.evil.test/a",
    "https://x.com/i/status/12",
    "https://evil@x.com/a",
    "https://x.com/search",
    "http://x.com/test",
    "https://x.com/test/status/1",
  ])
    expect(xHandle(u)).toBeUndefined();
});
it("quote-token scans never inherit base-token social links", () => {
  const pair = {
    chainId: "solana",
    dexId: "raydium",
    pairAddress: mint,
    baseToken: { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
    quoteToken: { address: mint },
    info: { socials: [{ type: "twitter", url: "https://x.com/wrong_token" }] },
  };
  expect(normalizeDex([pair], mint).details.socialLinks).toEqual([]);
  expect(
    normalizeDex([{ ...pair, baseToken: { address: mint } }], mint).details
      .socialLinks,
  ).toEqual(["https://x.com/wrong_token"]);
});
it("profile survives denied search and timeline; missing activity remains unknown", async () => {
  const f = vi.fn<typeof fetch>().mockImplementation(async (u) =>
    String(u).includes("/by/username/")
      ? new Response(
          JSON.stringify({
            data: {
              id: "42",
              username: "hyena",
              description: `CA: ${mint}`,
              verified: true,
              public_metrics: { followers_count: 177 },
            },
          }),
        )
      : new Response("denied", { status: 403 }),
  );
  const r = await fetchXResearch(
    new LiveHttp(f, 0),
    mint,
    "secret",
    "quick",
    AbortSignal.timeout(8000),
    ["https://x.com/hyena"],
  );
  expect(r.details.xProfiles?.[0]).toMatchObject({
    mintInBio: true,
    identity: "MINT_MATCH",
    timelineComplete: false,
  });
  expect(r.details.xProfiles?.[0].observed7d).toBeUndefined();
  expect(r.details.social?.pages).toBe(0);
  expect(r.data.accountVerified).toBeUndefined();
});
it("timeline uses pagination_token, deduplicates posts, and treats claims as unverified", async () => {
  let page = 0;
  const f = vi.fn<typeof fetch>().mockImplementation(async (u) => {
    const url = new URL(String(u));
    if (url.pathname.includes("/by/username/"))
      return new Response(
        JSON.stringify({
          data: { id: "42", username: "hyena", description: mint + "1" },
        }),
      );
    if (url.pathname.includes("/users/42/tweets")) {
      page++;
      if (page === 2)
        expect(url.searchParams.get("pagination_token")).toBe("next");
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "1",
              author_id: "42",
              text: `@ethena official? ${mint}`,
              created_at: new Date(Date.now() - 60000).toISOString(),
            },
          ],
          meta: page === 1 ? { next_token: "next" } : { result_count: 1 },
        }),
      );
    }
    return new Response(
      JSON.stringify({ data: [], meta: { result_count: 0 } }),
    );
  });
  const r = await fetchXResearch(
    new LiveHttp(f, 0),
    mint,
    "secret",
    "deep",
    AbortSignal.timeout(10000),
    ["https://x.com/hyena"],
  );
  expect(r.details.xProfiles?.[0]).toMatchObject({
    mintInBio: false,
    mintInPosts: true,
    observed7d: 1,
    observed30d: 1,
    timelineComplete: true,
  });
  expect(r.details.xProfiles?.[0].posts).toHaveLength(1);
  expect(r.data.accountVerified).toBeUndefined();
});
