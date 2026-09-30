import { it, expect, vi } from "vitest";
import { runInNewContext } from "node:vm";
vi.mock("electron", () => ({ BrowserWindow: class {}, session: {} }));
import { GmgnBrowser } from "../../main/services/gmgn-browser";
it("reads X profile/post clues only from the exact token card", async () => {
  const target = {
    chain: "sol" as const,
    address: "9twiuSdTVkwtAC9XQDG57dFRhF4iqPih461HJfMZKci9",
  };
  let url = `https://gmgn.ai/sol/token/${target.address}`;
  const links = [
    "https://x.com/weightlesswires/status/2105251378750742998",
    "https://x.com/search?q=wallet",
    "https://x.com/home",
    "https://evil.example/weightlesswires",
    "https://x.com/weightlesswires/status/2105251378750742998",
  ];
  const browser = new GmgnBrowser();
  const win = {
    isDestroyed: () => false,
    webContents: {
      getURL: () => url,
      executeJavaScript: async (script: string) =>
        runInNewContext(script, {
          URL,
          document: { querySelectorAll: () => links.map((href) => ({ href })) },
        }),
    },
  };
  Object.assign(browser, { window: win });
  expect(await browser.socialLinks(target)).toEqual([links[0]]);
  url = url.replace(target.address, target.address.toLowerCase());
  expect(await browser.socialLinks(target)).toEqual([]);
});
