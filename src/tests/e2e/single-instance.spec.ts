import { test, expect, _electron as electron } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("second launch exits and restores the existing window", async () => {
  const executablePath = process.env.SENTINEL_PACKAGED_EXE;
  test.skip(!executablePath, "Packaged executable required");
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-single-"));
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (e): e is [string, string] => e[1] !== undefined,
      ),
    ),
    SENTINEL_DATA_DIR: dir,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath, args: [], env });
  let second: ReturnType<typeof spawn> | undefined;
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByText("Настройки режима", { exact: true }),
    ).toBeVisible();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].hide(),
    );
    second = spawn(executablePath!, [], {
      env,
      stdio: "ignore",
      windowsHide: true,
    });
    const exited = await Promise.race([
      new Promise<boolean>((resolve) =>
        second!.once("exit", (code) => resolve(code === 0)),
      ),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000)),
    ]);
    expect(exited).toBe(true);
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isVisible(),
      ),
    ).toBe(true);
  } finally {
    if (second && second.exitCode === null) {
      const stopped = new Promise<void>((r) => second!.once("exit", () => r()));
      second.kill();
      await stopped;
    }
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
