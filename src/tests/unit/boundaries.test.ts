import { expect, it } from "vitest";
import { analyze } from "../../shared/analysis/analyze";
import {
  defaultSettings as appDefaultSettings,
  type Snapshot,
  type ProviderId,
  type Facts,
} from "../../shared/schemas/domain";
import { fetchDemoSnapshots } from "../../shared/providers/provider-registry";
import { demoMint } from "../../shared/providers/mock/fixtures";
import { commands } from "../../shared/schemas/ipc";
const defaultSettings = { ...appDefaultSettings, demoMode: true };
const now = "2026-09-23T12:00:00.000Z";
const base = () =>
  fetchDemoSnapshots(
    { mint: demoMint, scenario: "new-token", now },
    defaultSettings,
  );
const run = (s: Snapshot[]) =>
  analyze(
    { mint: demoMint, scenario: "new-token", mode: "quick" },
    s,
    defaultSettings,
    now,
    "boundaries",
  );
function set(s: Snapshot[], id: ProviderId, data: Facts) {
  Object.assign(s.find((x) => x.providerId === id)!.data!, data);
}
it.each([
  ["V3", "chain", { freezeAuthority: "active-unverified" }],
  ["V4", "scanner", { honeypot: true }],
  [
    "V5",
    "url",
    { officialMaliciousLink: true, officialChannelConfirmed: true },
  ],
  ["V7", "holders", { devSellProven: true }],
  ["V8", "holders", { priorRugsProven: true }],
  [
    "V9",
    "chain",
    {
      tokenProgram: "Token-2022",
      extensions: [
        {
          name: "PermanentDelegate",
          dangerous: true,
          explained: false,
          explanation: "Непроверенный делегат может распоряжаться балансами.",
        },
      ],
    },
  ],
  ["V10", "legitimacy", { claimsDisproven: true }],
] as [string, ProviderId, Facts][])(
  "%s исполняется независимо от score",
  async (code, id, data) => {
    const s = await base();
    set(s, id, data);
    expect(
      run(s).vetoes.find((v) => v.id.startsWith(code + "_"))?.triggered,
    ).toBe(true);
    expect(run(s).suitability.verdict).toBe("DO_NOT_ENTER");
  },
);
it("инсайдеры: 24.99 не critical, 25 critical, verified exemption не critical", async () => {
  const s = await base();
  set(s, "holders", { insiderPct: 24.99 });
  expect(run(s).vetoes[5].triggered).toBe(false);
  set(s, "holders", { insiderPct: 25 });
  expect(run(s).vetoes[5].triggered).toBe(true);
  set(s, "holders", { insiderExemptVerified: true });
  expect(run(s).vetoes[5].triggered).toBe(false);
});
it("verified authority и объяснённый Token-2022 не получают blanket veto", async () => {
  const s = await base();
  set(s, "timing", { ageHours: 200 });
  set(s, "chain", {
    mintAuthority: "active-verified",
    freezeAuthority: "active-verified",
    tokenProgram: "Token-2022",
    extensions: [
      {
        name: "TransferHook",
        dangerous: true,
        explained: true,
        explanation: "Подтверждённая система",
      },
    ],
  });
  expect(run(s).vetoes.some((v) => v.triggered)).toBe(false);
});
it("сомнительная принадлежность канала не превращает ссылку в official veto", async () => {
  const s = await base();
  set(s, "url", {
    officialMaliciousLink: true,
    officialChannelConfirmed: false,
  });
  expect(run(s).vetoes[4].triggered).toBe(false);
});
it("конфликт authority отдаёт приоритет chain и снижает consistency", async () => {
  const s = await base();
  set(s, "scanner", { scannerMintActive: true });
  const r = run(s);
  expect(r.vetoes[1].triggered).toBe(false);
  expect(r.confidence.conflicts).toHaveLength(1);
  expect(r.confidence.total).toBe(90);
});
it("границы возрастных начислений: 6, 24, 168 часов", async () => {
  const s = await base();
  for (const [age, score] of [
    [5.99, 7],
    [6, 4],
    [23.99, 4],
    [24, 2],
    [168, 0],
  ]) {
    set(s, "timing", { ageHours: age });
    expect(run(s).score.categories.timing).toBe(score);
  }
});
it("сумма применённых вкладов равна score, категории не превышают максимум", async () => {
  const s = await base();
  set(s, "chain", {
    mintAuthority: "active-unverified",
    freezeAuthority: "active-unverified",
    sellRestricted: true,
  });
  set(s, "holders", {
    insiderPct: 50,
    top1Pct: 50,
    top10Pct: 90,
    devSellProven: true,
    insiderSellUsd: 100000,
  });
  const r = run(s);
  expect(r.score.total).toBe(
    r.score.contributions.reduce((a, b) => a + b.points, 0),
  );
  expect(r.score.categories.contract).toBe(22);
  expect(r.score.categories.holders).toBe(20);
  expect(r.score.total).toBeLessThanOrEqual(100);
});
it("отсутствие X не приравнивается к critical veto", async () => {
  const s = await base();
  const social = s.find((x) => x.providerId === "social")!;
  delete social.data;
  social.status = "unavailable";
  const r = run(s);
  expect(r.vetoes.some((v) => v.triggered)).toBe(false);
  expect(r.confidence.total).toBe(80);
  expect(r.score.unknownCategories).toContain("social");
});
it("rejects javascript/file/http and credentials in external URL", () => {
  for (const url of [
    "javascript:alert(1)",
    "file:///C:/secret",
    "http://example.com",
    "https://user:pass@example.com",
  ])
    expect(commands.openExternal.input.safeParse(url).success).toBe(false);
  expect(
    commands.openExternal.input.safeParse("https://example.com").success,
  ).toBe(true);
});
it("essential market freshness ровно на deadline уже истекла", async () => {
  const s = await base();
  const r = analyze(
    { mint: demoMint, scenario: "new-token", mode: "quick" },
    s,
    defaultSettings,
    "2026-09-23T12:02:00.000Z",
    "boundary",
  );
  expect(r.suitability.verdict).toBe("MANUAL_REVIEW");
});
it("fresh success с пустыми chain facts не разрешает вход", async () => {
  const s = await base();
  s.find((x) => x.providerId === "chain")!.data = {};
  expect(run(s).suitability.verdict).toBe("MANUAL_REVIEW");
});
it("старый токен с риском 21 не получает лучший вердикт", async () => {
  const s = await base();
  set(s, "timing", { ageHours: 200 });
  set(s, "chain", { metadataMutableUnverified: true });
  set(s, "holders", { insiderPct: 16 });
  const r = run(s);
  expect(r.score.total).toBe(21);
  expect(r.suitability.verdict).toBe("MICRO_SIZE_ONLY");
});
it("просроченные холдеры ограничивают размер даже при confidence >=60", async () => {
  const s = await base();
  set(s, "timing", { ageHours: 200 });
  s.find((x) => x.providerId === "holders")!.expiresAt = now;
  expect(run(s).suitability.verdict).not.toBe("SAFE_ENOUGH_FOR_REVIEW");
});
it("удаление известного риска из частичного snapshot не снижает score", async () => {
  const s = await base();
  set(s, "timing", { ageHours: 200 });
  set(s, "holders", { insiderSellUsd: 300 });
  const before = run(s).score.total;
  delete s.find((x) => x.providerId === "holders")!.data!.insiderSellUsd;
  expect(run(s).score.total).toBeGreaterThanOrEqual(before);
});
