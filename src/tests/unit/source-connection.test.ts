import { expect, it, vi } from "vitest";
import { readConnection } from "../../main/services/source-connection";

it("does not navigate an active Grok chat while polling connection status", async () => {
  const loadURL = vi.fn(async () => undefined);
  const connection = await readConnection(
    {
      isDestroyed: () => false,
      loadURL,
      webContents: {
        getURL: () => "https://x.com/i/grok",
        executeJavaScript: async () => ({
          signedIn: true,
          signedOut: false,
          notice: "",
          challenge: false,
          grokQuotaText: "",
        }),
      },
    } as never,
    "grok",
  );

  expect(loadURL).not.toHaveBeenCalled();
  expect(connection.auth).toBe("signed-in");
});
