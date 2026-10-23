import { expect, it, vi } from "vitest";
import { withOperationTimeout } from "../../main/services/operation-timeout";

it("rejects a source operation that never settles", async () => {
  vi.useFakeTimers();
  const pending = withOperationTimeout(
    new Promise<never>(() => undefined),
    1_000,
    "Источник не ответил за 1 секунду.",
  );
  const assertion = expect(pending).rejects.toThrow(
    "Источник не ответил за 1 секунду.",
  );
  await vi.advanceTimersByTimeAsync(1_000);
  await assertion;
  vi.useRealTimers();
});
