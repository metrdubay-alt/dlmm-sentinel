import { describe, expect, it } from "vitest";
import { buildGrokPrompt, parseGrokAnswer } from "../../shared/analysis/grok";
const target = {
  chain: "bsc" as const,
  address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
};
const context = {
  target,
  handle: "Gstockbsc",
  requestId: "test-request-123",
  startedAt: "2026-09-26T12:00:00Z",
};
const answer = {
  requestId: context.requestId,
  chain: "bsc",
  mint: target.address,
  profile: "Gstockbsc",
  description: "Нарратив тестового токена.",
  score: 64,
  scoreReason: "Тестовая оценка по доступной выборке",
  narrative: "stable",
  redFlags: [
    {
      text: "Концентрация промо",
      sources: ["https://x.com/example/status/123"],
    },
  ],
  greenFlags: [],
  accounts: [],
  sources: ["https://x.com/example/status/123"],
  unknowns: [],
};
describe("Grok response identity and attribution", () => {
  it("makes an explicit public-token prompt and validates a fenced response", () => {
    const prompt = buildGrokPrompt(context);
    expect(prompt).toContain(target.address);
    expect(prompt).toContain(context.requestId);
    expect(prompt).toContain("7/30");
    expect(
      parseGrokAnswer("```json\n" + JSON.stringify(answer) + "\n```", context),
    ).toMatchObject({ score: 64, mint: target.address });
  });
  it("rejects an old run, another token, chain or handle", () => {
    for (const patch of [
      { requestId: "old" },
      { mint: "0x1111111111111111111111111111111111111111" },
      { chain: "sol" },
      { profile: "other" },
    ])
      expect(() =>
        parseGrokAnswer(JSON.stringify({ ...answer, ...patch }), context),
      ).toThrow();
  });
  it("does not accept source-free scores, unsafe links or incomplete JSON", () => {
    expect(() =>
      parseGrokAnswer(JSON.stringify({ ...answer, sources: [] }), context),
    ).toThrow();
    expect(() =>
      parseGrokAnswer(
        JSON.stringify({ ...answer, sources: ["javascript:alert(1)"] }),
        context,
      ),
    ).toThrow();
    expect(() => parseGrokAnswer('{"score":90}', context)).toThrow();
    expect(
      parseGrokAnswer(
        JSON.stringify({ ...answer, score: null, sources: [], redFlags: [] }),
        context,
      ).score,
    ).toBeNull();
  });
});

it("retains a matching report but moves flags with empty sources to unknowns", () => {
  const result = parseGrokAnswer(
    JSON.stringify({
      ...answer,
      redFlags: [
        ...answer.redFlags,
        { text: "Профиль не связан с контрактом", sources: [] },
      ],
      greenFlags: [{ text: "Непроверенное достоинство", sources: [] }],
    }),
    context,
  );
  expect(result.score).toBe(64);
  expect(result.redFlags).toEqual(answer.redFlags);
  expect(result.greenFlags).toEqual([]);
  expect(result.unknowns.join(" ")).toContain("Профиль не связан с контрактом");
  expect(result.unknowns.join(" ")).toContain("Непроверенное достоинство");
});
it("still rejects unsafe flag links and another mint when a flag lacks sources", () => {
  for (const patch of [
    { mint: "0x1111111111111111111111111111111111111111" },
    { greenFlags: [{ text: "Unsafe", sources: ["javascript:alert(1)"] }] },
  ]) {
    expect(() =>
      parseGrokAnswer(
        JSON.stringify({
          ...answer,
          redFlags: [{ text: "Без ссылки", sources: [] }],
          ...patch,
        }),
        context,
      ),
    ).toThrow();
  }
});

it("uses GMGN social clues and rejects a launchpad nickname without an X identity", () => {
  const socialLinks = [
    "https://x.com/weightlesswires/status/2105251378750742998",
  ];
  expect(buildGrokPrompt({ ...context, socialLinks })).toContain(
    socialLinks[0],
  );
  const result = parseGrokAnswer(
    JSON.stringify({
      ...answer,
      relatedAccounts: [
        {
          handle: "gigamantaunanti",
          role: "creator",
          source: "https://solscan.io/token/example",
        },
        {
          handle: "weightlesswires",
          role: "narrative",
          source: socialLinks[0],
        },
      ],
    }),
    context,
  );
  expect(result.relatedAccounts?.map((a) => a.handle)).toEqual([
    "weightlesswires",
  ]);
});
