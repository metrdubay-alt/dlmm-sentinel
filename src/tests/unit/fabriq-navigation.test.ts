import { expect, it, vi } from "vitest";
vi.mock("electron", () => ({ BrowserWindow: vi.fn(), session: {} }));
import { FabriqBrowser } from "../../main/services/fabriq-browser";

it("reads visible Fabriq rows but treats a challenge or malformed page as empty evidence", async () => {
  const win = {
    isDestroyed: () => false,
    webContents: {
      getURL: () => "https://fabriq.trade/trending",
      executeJavaScript: vi.fn(async () => []),
    },
  };
  const browser = new FabriqBrowser();
  Reflect.set(browser, "window", win);
  await expect(browser.capture()).resolves.toEqual([]);
  win.webContents.getURL = () => "https://fabriq.trade/cdn-cgi/challenge";
  await expect(browser.capture()).resolves.toEqual([]);
});
