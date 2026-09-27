import { it, expect } from "vitest";
import { analyze } from "../../shared/analysis/analyze";
import { defaultSettings, type Snapshot } from "../../shared/schemas/domain";
const now = "2026-09-23T00:00:00.000Z";
const market: Snapshot = {
  providerId: "market",
  displayName: "DexScreener",
  status: "partial",
  data: { liquidityUsd: 1000, pumpPct: 500 },
  fetchedAt: now,
  expiresAt: "2026-09-23T00:05:00.000Z",
  sourceUrls: [],
  sourceType: "live",
  evidenceId: "market",
  confidence: 65,
  stale: false,
};
const report = () =>
  analyze(
    {
      mint: "So11111111111111111111111111111111111111112",
      scenario: "new-token",
      mode: "quick",
    },
    [market],
    { ...defaultSettings, demoMode: false },
    now,
    "test",
  );
it("наличие liquidityUsd не завершает проверку вывода ликвидности", () => {
  expect(report().vetoes.find((v) => v.id.startsWith("V1_"))?.status).toBe(
    "INSUFFICIENT_DATA",
  );
});
it("24h return не утверждает параболу и отсутствие катализатора", () => {
  const r = report();
  expect(
    r.score.contributions.find((c) => c.ruleId === "D_PUMP")?.explanation,
  ).toContain("Рост цены за 24 часа");
  expect(r.suitability.softVetoes.join(" ")).not.toContain("параболический");
});
