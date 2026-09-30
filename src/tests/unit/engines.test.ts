import { describe, expect, it } from "vitest";
import { analyze } from "../../shared/analysis/analyze";
import {
  defaultSettings as appDefaultSettings,
  mintSchema,
  type Scenario,
} from "../../shared/schemas/domain";
import { demoMint } from "../../shared/providers/mock/fixtures";
import { fetchDemoSnapshots } from "../../shared/providers/provider-registry";
const defaultSettings = { ...appDefaultSettings, demoMode: true };
const now = "2026-09-23T12:00:00.000Z";
async function run(scenario: Scenario) {
  const snapshots = await fetchDemoSnapshots(
    { mint: demoMint, scenario, now },
    defaultSettings,
  );
  return analyze(
    { mint: demoMint, scenario, mode: "quick" },
    snapshots,
    defaultSettings,
    now,
    "test",
  );
}
describe("детерминированная оценка", () => {
  it("новый токен допускает только микроразмер при полном покрытии", async () => {
    const r = await run("new-token");
    expect(r.score.total).toBe(4);
    expect(r.confidence.total).toBe(100);
    expect(r.suitability.verdict).toBe("MICRO_SIZE_ONLY");
    expect(r.vetoes.some((v) => v.triggered)).toBe(false);
  });
  it.each([
    ["concentration", "V6"],
    ["mint-authority", "V2"],
    ["drained", "V1"],
  ] as const)("%s вызывает %s и запрет входа", async (s, id) => {
    const r = await run(s);
    expect(r.vetoes.find((v) => v.id.startsWith(id + "_"))?.triggered).toBe(
      true,
    );
    expect(r.suitability.verdict).toBe("DO_NOT_ENTER");
  });
  it("социальные подозрения не превращаются в доказанный critical veto", async () => {
    const r = await run("social");
    expect(r.score.categories.social).toBe(12);
    expect(r.vetoes.some((v) => v.triggered)).toBe(false);
  });
  it("отсутствие данных не создаёт зелёного отчёта", async () => {
    const r = await run("insufficient");
    expect(r.confidence.total).toBe(0);
    expect(r.suitability.verdict).toBe("MANUAL_REVIEW");
    expect(r.score.unknownCategories).toHaveLength(7);
    expect(r.score.total).toBeGreaterThanOrEqual(
      (await run("new-token")).score.total,
    );
  });
  it("одинаковые снимки и параметры воспроизводят отчёт", async () => {
    expect(await run("concentration")).toEqual(await run("concentration"));
  });
  it("при существующей позиции critical veto требует выхода/ручной проверки", async () => {
    const snapshots = await fetchDemoSnapshots(
      { mint: demoMint, scenario: "drained", now },
      defaultSettings,
    );
    const r = analyze(
      {
        mint: demoMint,
        scenario: "drained",
        mode: "quick",
        position: {
          pair: "DEMO/USDC",
          pool: "demo",
          currentPrice: 1,
          lowerPrice: 0.9,
          upperPrice: 1.1,
          amountUsd: 100,
          horizonHours: 4,
          maxLossPct: 10,
          recorded: true,
        },
      },
      snapshots,
      defaultSettings,
      now,
      "test",
    );
    expect(r.suitability.verdict).toBe("EXIT_OR_MANUAL_REVIEW");
  });
  it("критический veto перекрывает нулевые веса категории", async () => {
    const settings = structuredClone(defaultSettings);
    settings.weights = {
      contract: 0,
      holders: 0,
      liquidity: 0,
      flow: 100,
      social: 0,
      legitimacy: 0,
      timing: 0,
    };
    const s = await fetchDemoSnapshots(
      { mint: demoMint, scenario: "mint-authority", now },
      settings,
    );
    const r = analyze(
      { mint: demoMint, scenario: "mint-authority", mode: "quick" },
      s,
      settings,
      now,
      "test",
    );
    expect(r.score.total).toBe(0);
    expect(r.suitability.verdict).toBe("DO_NOT_ENTER");
  });
  it("устаревшие essential данные запрещают положительный вывод", async () => {
    const s = await fetchDemoSnapshots(
      { mint: demoMint, scenario: "new-token", now },
      defaultSettings,
    );
    const r = analyze(
      { mint: demoMint, scenario: "new-token", mode: "quick" },
      s,
      defaultSettings,
      "2026-09-24T12:00:00.000Z",
      "test",
    );
    expect(r.confidence.total).toBeLessThan(40);
    expect(r.suitability.verdict).toBe("MANUAL_REVIEW");
  });
  it("проверяет 32 байта Base58, сохраняет регистр и убирает пробелы", () => {
    expect(mintSchema.parse(" " + demoMint + " ")).toBe(demoMint);
    expect(mintSchema.safeParse("SOL").success).toBe(false);
    expect(mintSchema.safeParse("1".repeat(33)).success).toBe(false);
  });
});
