import { expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { readConnection } from "../../main/services/source-connection";

// grok.com/settings/usage answered 404 on 2026-10-12; status polling must never leave the user's Grok chat.
it("reads Grok connection status without navigating away from the Grok chat", async () => {
  const url = "https://x.com/i/grok?conversation=1";
  const loadURL = vi.fn();
  const win = {
    isDestroyed: () => false,
    loadURL,
    webContents: {
      getURL: () => url,
      stop() {},
      executeJavaScript: async () => ({
        signedIn: true,
        signedOut: false,
        notice: "",
        challenge: false,
        usage: null,
        grokQuotaText: "",
      }),
    },
  } as unknown as BrowserWindow;

  await readConnection(win, "grok");

  expect(loadURL).not.toHaveBeenCalled();
});
