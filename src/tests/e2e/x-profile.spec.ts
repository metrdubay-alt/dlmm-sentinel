import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../../main/services/database";
import { AnalysisService } from "../../main/services/analysis-service";
import { demoMint } from "../../shared/providers/mock/fixtures";

test("ДЕМО-ДАННЫЕ: профиль X, неизвестная активность и сохранённые свидетельства", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-x-e2e-"));
  const db = await openDatabase(dir, path.resolve("prisma/migrations"));
  try {
    const r = await new AnalysisService(db).scan({
      mint: demoMint,
      scenario: "insufficient",
      mode: "deep",
    });
    const now = new Date().toISOString();
    r.snapshots.find((s) => s.providerId === "social")!.details = {
      notes: ["ДЕМО-ДАННЫЕ: искусственный профиль для проверки UI."],
      social: {
        periodDays: 30,
        start: now,
        end: now,
        complete: false,
        pages: 0,
        query: demoMint,
        posts: [],
      },
      xProfiles: [
        {
          username: "demo_profile",
          url: "https://x.com/demo_profile",
          discoveredFrom: "https://x.com/demo_profile",
          id: "42",
          identity: "MINT_MATCH",
          mintInBio: true,
          mintInPosts: false,
          description: `ДЕМО-ДАННЫЕ ${demoMint}`,
          timelineComplete: false,
          pages: 1,
          start: now,
          end: now,
          posts: [],
          notes: ["ДЕМО-ДАННЫЕ. Совпадение текста не доказывает подлинность."],
          error: "X вернул частичные ошибки timeline.",
        },
      ],
    };
    await db.scan.update({
      where: { id: r.id },
      data: { reportJson: JSON.stringify(r) },
    });
  } finally {
    await db.$disconnect();
  }
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined,
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
  try {
    expect(await app.evaluate(({ app }) => app.getPath("userData"))).toBe(dir);
    const page = await app.firstWindow();
    await page
      .getByRole("button", { name: "Открыть отчёт", exact: true })
      .click();
    await page.getByRole("tab", { name: "X / Social", exact: true }).click();
    await expect(
      page.getByText("@demo_profile · заявленный аккаунт", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Точный mint найден в тексте аккаунта", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/Прочитано за 7 дней: Нет данных; за 30 дней: Нет данных/),
    ).toBeVisible();
    await expect(page.getByText(/Поиск упоминаний не выполнен/)).toBeVisible();
    await page.screenshot({
      path: "test-results/x-profile-demo.png",
      fullPage: true,
    });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
