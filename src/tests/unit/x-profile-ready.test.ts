import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
import { xProfileReadyScript } from "../../main/services/x-profile-ready";

it("waits for the requested profile and following count after HTML load", async () => {
  vi.useFakeTimers();
  let ready = false;
  const root = {
    querySelector: (selector: string) =>
      ready
        ? {
            innerText: selector.includes("UserName")
              ? "Example @example"
              : "37 Following",
          }
        : null,
  };
  try {
    const result = runInNewContext(xProfileReadyScript("Example"), {
      document: { querySelector: () => root },
      location: { pathname: "/example" },
      Date,
      setTimeout,
    }) as Promise<boolean>;
    let resolved = false;
    void result.then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(resolved).toBe(false);
    ready = true;
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

it("rejects navigation to another profile", async () => {
  await expect(
    runInNewContext(xProfileReadyScript("example"), {
      location: { pathname: "/someone_else" },
      Date,
      setTimeout,
    }),
  ).rejects.toThrow("Страница X изменилась");
});
