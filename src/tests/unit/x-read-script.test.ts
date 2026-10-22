// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";

vi.mock("electron", () => ({ BrowserWindow: class {}, session: {} }));
const { X_OWN_FOLLOWING_SCRIPT, X_READ_SCRIPT } =
  await import("../../main/services/x-browser");

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

it("reads the complete signed-in following list without relying on a token followers page", async () => {
  (
    window as unknown as { happyDOM: { setURL(url: string): void } }
  ).happyDOM.setURL("https://x.com/metralone1972/following");
  document.body.innerHTML = `<main data-testid="primaryColumn">
    <div data-testid="UserCell"><a href="/alice">Alice</a></div>
    <div data-testid="UserCell"><a href="/lastagencymeme">Last Agency</a></div>
  </main>`;

  await expect(
    (0, eval)(
      X_OWN_FOLLOWING_SCRIPT.replace(
        "__SENTINEL_FOLLOWING_TOTAL__",
        JSON.stringify("2 Following"),
      ),
    ),
  ).resolves.toMatchObject({
    followingTotal: "2 Following",
    handles: ["alice", "lastagencymeme"],
    complete: true,
  });
});
