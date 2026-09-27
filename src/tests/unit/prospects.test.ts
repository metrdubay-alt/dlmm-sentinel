import { expect, it } from "vitest";
import {
  criteria,
  assessProspects,
  prospectsInputSchema,
} from "../../shared/analysis/prospects";
const base = {
  mint: "mint",
  description: "Мем",
  projectType: "meme",
  observations: [],
  flags: [],
};
it("missing evidence is unknown, never zero or normalized", () => {
  expect(assessProspects(base)).toMatchObject({
    earned: 0,
    covered: 0,
    upper: 100,
    score: null,
  });
});
it("weights total 100 and partial evidence keeps full uncertainty", () => {
  expect(criteria.reduce((s, c) => s + c.maximum, 0)).toBe(100);
  const result = assessProspects({
    ...base,
    observations: [
      {
        criterion: criteria[0].id,
        level: 50,
        explanation: "Наблюдение",
        source: "https://x.com/example/status/1",
        observedAt: "2026-09-23T00:00:00.000Z",
      },
    ],
  });
  expect(result).toMatchObject({
    earned: 2.5,
    covered: 5,
    upper: 97.5,
    score: null,
  });
});
it("rejects duplicate criteria and unsupported scores", () => {
  const observation = {
    criterion: criteria[0].id,
    level: 33,
    explanation: "test",
    source: "https://x.com/a",
    observedAt: "2026-09-23T00:00:00.000Z",
  };
  expect(
    prospectsInputSchema.safeParse({ ...base, observations: [observation] })
      .success,
  ).toBe(false);
  expect(
    prospectsInputSchema.safeParse({
      ...base,
      observations: [
        { ...observation, level: 0 },
        { ...observation, level: 0 },
      ],
    }).success,
  ).toBe(false);
});
it("critical user evidence cannot be offset by score or labeled independently confirmed", () => {
  const result = assessProspects({
    ...base,
    flags: [
      {
        severity: "critical",
        text: "Подмена mint",
        source: "https://x.com/a",
        observedAt: "2026-09-23T00:00:00.000Z",
      },
    ],
  });
  expect(result.outcome).toContain("критической");
  expect(result.provenance).toContain("не проверены");
});
it("full coverage can be zero without being unknown and complete score is bounded", () => {
  const observations = criteria.map((c) => ({
    criterion: c.id,
    level: 0,
    explanation: `Проверено отсутствие: ${c.id}`,
    source: "https://x.com/example",
    observedAt: "2026-09-23T00:00:00.000Z",
  }));
  expect(assessProspects({ ...base, observations })).toMatchObject({
    score: 0,
    covered: 100,
    upper: 0,
  });
  expect(
    assessProspects({
      ...base,
      observations: observations.map((o) => ({ ...o, level: 100 })),
    }),
  ).toMatchObject({ score: 100, covered: 100, upper: 100 });
  expect(
    prospectsInputSchema.safeParse({
      ...base,
      observations: observations.map((o) => ({
        ...o,
        explanation: "Повторённый факт",
      })),
    }).success,
  ).toBe(false);
});
