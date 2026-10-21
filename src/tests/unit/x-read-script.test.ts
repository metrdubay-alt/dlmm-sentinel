// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";

vi.mock("electron", () => ({ BrowserWindow: class {}, session: {} }));
const { X_READ_SCRIPT } = await import("../../main/services/x-browser");

it("waits for X to render the profile column before reading the following count", async () => {
  (
    window as unknown as { happyDOM: { setURL(url: string): void } }
  ).happyDOM.setURL("https://x.com/metralone1972");
  document.body.innerHTML = "";
  setTimeout(() => {
    document.body.innerHTML = `
      <main data-testid="primaryColumn">
        <div data-testid="UserName">Андрей @metralone1972</div>
        <a href="/metralone1972/following">32 Following</a>
      </main>`;
  }, 10);

  await expect((0, eval)(X_READ_SCRIPT)).resolves.toMatchObject({
    following: "32 Following",
    identity: "Андрей @metralone1972",
  });
});
