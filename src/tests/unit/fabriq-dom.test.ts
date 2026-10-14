import { expect, it } from "vitest";
import { parseFabriqPoolFees } from "../../main/services/fabriq-dom";

const pool = "4ZfF9aF2Y2xK3Zq1yXwxzD3NUGjUW5pQjKf9pW3NN3kG";

it("reads a 5m-fee value only when Fabriq exposes the exact pool address", () => {
  expect(
    parseFabriqPoolFees([
      {
        href: `https://fabriq.trade/pool/${pool}`,
        label: "CONDOM-SOL",
        fees5mText: "$530.88",
      },
    ]),
  ).toEqual([{ address: pool, fees5mUsd: 530.88 }]);
});

it("does not match a token page or a compact / malformed fee", () => {
  expect(
    parseFabriqPoolFees([
      {
        href: `https://fabriq.trade/token/${pool}`,
        label: "CONDOM-SOL",
        fees5mText: "$530.88",
      },
      {
        href: `https://fabriq.trade/pool/${pool}`,
        label: "CONDOM-SOL",
        fees5mText: "$0.5K",
      },
    ]),
  ).toEqual([]);
});

it("rejects ambiguous duplicates rather than choosing a fee", () => {
  expect(
    parseFabriqPoolFees([
      {
        href: `https://fabriq.trade/pool/${pool}`,
        label: "CONDOM-SOL",
        fees5mText: "$530.88",
      },
      {
        href: `https://fabriq.trade/pool/${pool}`,
        label: "CONDOM-SOL",
        fees5mText: "$531.88",
      },
    ]),
  ).toEqual([]);
});
