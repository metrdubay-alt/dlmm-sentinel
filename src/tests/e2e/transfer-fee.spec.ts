import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("transfer fee warning persists without GMGN and stays marked stale on RPC failure", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-transfer-fee-"));
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  env.SENTINEL_DATA_DIR = dir;
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.SENTINEL_PACKAGED_EXE;
  const app = await electron.launch({
    args: executablePath ? [] : ["."],
    executablePath,
    env,
  });
  const target = {
    chain: "sol" as const,
    address: "So11111111111111111111111111111111111111112",
  };
  try {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      globalThis.fetch = async (_url, init) => {
        const fee = {
          epoch: 0,
          maximumFee: 1000000000,
          transferFeeBasisPoints: 300,
        };
        return new Response(
          JSON.stringify({
            result:
              JSON.parse(String(init?.body)).method === "getEpochInfo"
                ? { epoch: 12 }
                : {
                    value: {
                      owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
                      data: {
                        parsed: {
                          type: "mint",
                          info: {
                            decimals: 6,
                            extensions: [
                              {
                                extension: "transferFeeConfig",
                                state: {
                                  olderTransferFee: fee,
                                  newerTransferFee: fee,
                                  transferFeeConfigAuthority: null,
                                },
                              },
                            ],
                          },
                        },
                      },
                    },
                  },
          }),
        );
      };
    });
    const page = await app.firstWindow();
    await page.evaluate(
      (t) =>
        window.sentinel.workspaceSave({
          target: t,
          label: "ДЕМО TRANSFER FEE",
          handle: null,
          monitor: false,
          intervalMinutes: 15,
        }),
      target,
    );
    await page.getByLabel("Режим данных").selectOption("live");
    await expect(page.getByLabel("Режим данных")).toBeEnabled();
    const result = await page.evaluate(
      (target) =>
        window.sentinel.workspaceRefresh({
          target,
          navigate: false,
          scope: "numeric",
        }),
      target,
    );
    expect(result.transferFee?.percent).toBe(3);
    expect(result.gmgn).toBeNull();
    await page.getByRole("button", { name: "Архив", exact: true }).click();
    await page
      .getByRole("row")
      .filter({ hasText: "ДЕМО TRANSFER FEE" })
      .getByRole("button", { name: "Открыть карточку", exact: true })
      .click();
    const warning = page.locator(".transfer-fee-warning");
    await expect(
      page
        .locator("section.panel")
        .filter({
          has: page.getByRole("heading", {
            name: "1. Числовой анализ",
            exact: true,
          }),
        })
        .locator("h2 + .transfer-fee-warning"),
    ).toBeVisible();
    await expect(warning).toContainText("!!! Комиссия за перевод токена: 3%");
    await expect(warning).toHaveCSS("border-top-color", "rgb(234, 191, 56)");
    await warning.screenshot({ path: "test-results/transfer-fee-warning.png" });
    await app.evaluate(() => {
      globalThis.fetch = async () => {
        throw Error("offline");
      };
    });
    const failed = await page.evaluate(
      (target) =>
        window.sentinel.workspaceRefresh({
          target,
          navigate: false,
          scope: "numeric",
        }),
      target,
    );
    expect(failed.transferFee).toMatchObject({
      status: "configured",
      percent: 3,
      stale: true,
    });
    await page.reload();
    expect(
      (await page.evaluate((t) => window.sentinel.workspaceReport(t), target))
        .transferFee,
    ).toMatchObject({ percent: 3, stale: true });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
