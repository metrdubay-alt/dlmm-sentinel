import { describe, it, expect, vi } from "vitest";
import { waitForGrokPage } from "../../main/services/grok-navigation";

describe("Grok navigation recovery", () => {
  it("waits for a transient landing page without reopening", async () => {
    let url = "https://x.com/home";
    const recover = vi.fn();
    await waitForGrokPage({
      url: () => url,
      checkWindow: () => {},
      recover,
      pause: async () => {
        url = "https://x.com/i/grok?conversation=abc";
      },
    });
    expect(recover).not.toHaveBeenCalled();
  });
  it("reopens a failed landing page once before submission", async () => {
    let url = "https://grok.com/settings/usage";
    const recover = vi.fn(async () => {
      url = "https://x.com/i/grok";
    });
    await waitForGrokPage({
      url: () => url,
      checkWindow: () => {},
      recover,
      pause: async () => {},
    });
    expect(recover).toHaveBeenCalledTimes(1);
  });
  it("bounds retries when landing page persists", async () => {
    const recover = vi.fn(async () => {});
    await expect(
      waitForGrokPage({
        url: () => "https://x.com/home",
        checkWindow: () => {},
        recover,
        pause: async () => {},
      }),
    ).rejects.toThrow("не загрузилась");
    expect(recover).toHaveBeenCalledTimes(1);
  });
  it("never reopens a submitted chat", async () => {
    await expect(
      waitForGrokPage({
        url: () => "https://x.com/home",
        checkWindow: () => {},
        pause: async () => {},
      }),
    ).rejects.toThrow("Повторная".toLowerCase());
  });
  it.each([
    "https://x.com/i/flow/login",
    "https://grok.com/login",
    "https://x.com/someone",
    "https://evil.test/i/grok",
  ])("does not recover login or unrelated page %s", async (url) => {
    const recover = vi.fn();
    await expect(
      waitForGrokPage({ url: () => url, checkWindow: () => {}, recover }),
    ).rejects.toThrow();
    expect(recover).not.toHaveBeenCalled();
  });
  it("honors cancellation before recovery", async () => {
    const recover = vi.fn();
    await expect(
      waitForGrokPage({
        url: () => "about:blank",
        checkWindow: () => {
          throw new Error("cancelled");
        },
        recover,
      }),
    ).rejects.toThrow("cancelled");
    expect(recover).not.toHaveBeenCalled();
  });
});

describe("last polling interval", () => {
  it.each([
    "https://x.com/i/grok?conversation=ready",
    "https://x.com/i/flow/login",
    "https://x.com/other",
  ])("rechecks late URL %s before reopening", async (next) => {
    let url = "https://x.com/home",
      ticks = 0;
    const recover = vi.fn(async () => {
      url = "https://x.com/i/grok";
    });
    const result = waitForGrokPage({
      url: () => url,
      checkWindow: () => {},
      recover,
      pause: async () => {
        if (++ticks === 10) url = next;
      },
    });
    if (next.includes("?conversation"))
      await expect(result).resolves.toBeUndefined();
    else await expect(result).rejects.toThrow();
    expect(recover).not.toHaveBeenCalled();
  });
  it("accepts readiness at the last tick after recovery", async () => {
    let url = "https://x.com/home",
      ticks = 0;
    const recover = vi.fn(async () => {});
    await waitForGrokPage({
      url: () => url,
      checkWindow: () => {},
      recover,
      pause: async () => {
        if (++ticks === 20) url = "https://x.com/i/grok";
      },
    });
    expect(recover).toHaveBeenCalledTimes(1);
  });
  it("honors cancellation during the last pause", async () => {
    let ticks = 0;
    const recover = vi.fn();
    await expect(
      waitForGrokPage({
        url: () => "https://x.com/home",
        checkWindow: () => {
          if (ticks === 10) throw new Error("cancelled");
        },
        recover,
        pause: async () => {
          ticks++;
        },
      }),
    ).rejects.toThrow("cancelled");
    expect(recover).not.toHaveBeenCalled();
  });
});
