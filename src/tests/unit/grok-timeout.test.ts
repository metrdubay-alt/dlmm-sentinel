import { expect, it } from "vitest";
import {
  GROK_RESPONSE_TIMEOUT_MS,
  grokResponseDeadline,
} from "../../shared/analysis/grok-timeout";

it("allows an eight-minute research response before timing out", () => {
  const submittedAt = 1_762_000_000_000;
  expect(GROK_RESPONSE_TIMEOUT_MS).toBe(8 * 60_000);
  expect(grokResponseDeadline(submittedAt)).toBe(submittedAt + 8 * 60_000);
});
