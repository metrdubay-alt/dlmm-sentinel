import { expect, it, vi } from "vitest";
vi.mock("electron", () => ({ BrowserWindow: vi.fn(), session: {} }));
import { GmgnBrowser } from "../../main/services/gmgn-browser";
it("reads an already loaded token without reloading, but reloads an empty card", async () => {
  const target = {
    chain: "robinhood" as const,
    address: "0xfd1a35778d9798f13c6fb97d29c07a5ce3f7fb5e",
  };
  const win = {
    isDestroyed: () => false,
    hide: vi.fn(),
    show: vi.fn(),
    loadURL: vi.fn(async () => {}),
    webContents: {
      getURL: () => `https://gmgn.ai/robinhood/token/${target.address}`,
      isLoading: () => false,
      executeJavaScript: vi.fn(async () => true),
    },
  };
  const browser = new GmgnBrowser();
  Reflect.set(browser, "window", win);
  await browser.open(target, win as never, true);
  expect(win.loadURL).not.toHaveBeenCalled();
  win.webContents.executeJavaScript.mockResolvedValue(false);
  await browser.open(target, win as never, true);
  expect(win.loadURL).toHaveBeenCalledOnce();
});
