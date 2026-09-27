import { expect, it } from "vitest";
import { nextDueWorkspace } from "../../shared/analysis/workspace";
const config = {
  target: {
    chain: "bsc" as const,
    address: "0xcafdbce93477261db8250e42bdae6e66733f9e20",
  },
  label: "",
  handle: null,
  monitor: true,
  intervalMinutes: 5 as const,
};
it("does not schedule paused/demo tokens, or catch up missed intervals in a burst", () => {
  const state = {
    config,
    lastAttempt: "2026-09-26T00:00:00.000Z",
    errors: {},
    alerts: [],
    research: [],
  };
  const now = Date.parse("2026-09-26T00:05:00.000Z");
  expect(nextDueWorkspace([state], now, true)).toBeUndefined();
  expect(
    nextDueWorkspace(
      [{ ...state, config: { ...config, monitor: false } }],
      now,
      false,
    ),
  ).toBeUndefined();
  expect(nextDueWorkspace([state], now - 1, false)).toBeUndefined();
  expect(nextDueWorkspace([state], now, false)).toEqual(state);
  expect(
    nextDueWorkspace([state, { ...state, lastAttempt: null }], now, false)
      ?.lastAttempt,
  ).toBeNull();
});
