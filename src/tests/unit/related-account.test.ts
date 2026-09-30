import { it, expect } from "vitest";
import {
  relatedAccountSchema,
  mergeRelatedAccounts,
} from "../../shared/analysis/related-account";
it("keeps reviewed fee recipients separate from creator claims", () => {
  const reviewed = relatedAccountSchema.parse({
    handle: "@BeffJezos",
    role: "fee_recipient",
    source: "https://usepaid.app/token/example",
    attribution: "reviewed",
  });
  const rows = mergeRelatedAccounts(
    [reviewed],
    [{ ...reviewed, source: "https://x.com/beffjezos" }],
  );
  expect(rows).toEqual([reviewed]);
  expect(rows[0].handle).toBe("beffjezos");
  expect(rows[0].role).toBe("fee_recipient");
  expect(
    relatedAccountSchema.safeParse({
      ...reviewed,
      source: "http://example.com",
    }).success,
  ).toBe(false);
});

it("replaces stale Grok claims but retains reviewed accounts", () => {
  const saved = [
    relatedAccountSchema.parse({
      handle: "wrong",
      role: "creator",
      source: "https://solscan.io/token/example",
      attribution: "grok",
    }),
  ];
  expect(mergeRelatedAccounts(saved, [])).toEqual([]);
});
