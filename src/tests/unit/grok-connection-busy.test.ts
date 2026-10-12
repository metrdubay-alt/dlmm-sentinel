import { expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";

vi.mock("electron", () => ({ BrowserWindow: class {}, session: {} }));
const { GrokBrowser } = await import("../../main/services/grok-browser");

it("does not move the Grok window to the usage page while an analysis is running", async () => {
  let url = "https://x.com/i/grok";
  const loadURL = vi.fn(async (next: string) => {
    url = next;
  });
  const win = {
    isDestroyed: () => false,
    hide() {},
    show() {},
    destroy() {},
    loadURL,
    webContents: {
      getURL: () => url,
      stop() {},
      // The analysis waits for the Grok editor; keep it waiting.
      executeJavaScript: () => new Promise(() => {}),
    },
  };
  const grok = new GrokBrowser();
  (grok as unknown as { window: unknown }).window = win;
  void grok
    .run(
      {
        target: { chain: "sol", address: "x" },
        handle: null,
      } as never,
      {} as BrowserWindow,
    )
    .catch(() => undefined);
  await vi.waitFor(() => expect(loadURL).toHaveBeenCalledTimes(1));

  await grok.connection();

  expect(loadURL).toHaveBeenCalledTimes(1);
  expect(url).toBe("https://x.com/i/grok");
  grok.cancel();
});
