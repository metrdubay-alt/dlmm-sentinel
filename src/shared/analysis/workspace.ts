import { z } from "zod";
import { relatedAccountSchema } from "./related-account";
import { grokResultSchema } from "./grok";
import {
  gmgnTargetSchema,
  gmgnSnapshotSchema,
  gmgnStrategyInput,
  type GmgnSnapshot,
} from "./gmgn";
import {
  moniHandleSchema,
  moniSnapshotSchema,
  type MoniSnapshot,
} from "./moni";
import { xProfileSchema, compareXProfiles, type XProfile } from "./x-browser";
import { prospectsInputSchema } from "./prospects";
import { numericScore } from "./numeric-score";
export const workspaceConfigSchema = z
  .object({
    target: gmgnTargetSchema,
    label: z.string().trim().max(100),
    handle: moniHandleSchema.nullable(),
    relatedAccounts: z.array(relatedAccountSchema).max(5).optional(),
    monitor: z.boolean(),
    moniEnabled: z.boolean().optional(),
    intervalMinutes: z.union([
      z.literal(5),
      z.literal(15),
      z.literal(30),
      z.literal(60),
    ]),
  })
  .strict();
export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;
export const alertSchema = z.object({
  id: z.string(),
  at: z.string().datetime(),
  code: z.string(),
  text: z.string().max(2000),
  source: z.enum(["gmgn", "moni", "x", "system"]),
});
export const researchSchema = z
  .object({
    target: gmgnTargetSchema,
    handle: moniHandleSchema.nullable(),
    input: prospectsInputSchema,
    origin: z.enum(["user", "grok-reviewed"]),
    savedAt: z.string().datetime(),
  })
  .strict();
export const workspaceStateSchema = z
  .object({
    config: workspaceConfigSchema,
    lastAttempt: z.string().datetime().nullable(),
    errors: z.record(z.string().max(500)),
    alerts: z.array(alertSchema).max(200),
    research: z.array(researchSchema).max(30),
    grok: grokResultSchema.nullable().optional(),
  })
  .strict();
export const workspaceReportSchema = workspaceStateSchema.extend({
  relatedMoni: z
    .array(
      z.object({
        handle: moniHandleSchema,
        snapshot: moniSnapshotSchema.nullable(),
      }),
    )
    .max(5)
    .optional(),
  gmgn: gmgnSnapshotSchema.nullable(),
  moni: moniSnapshotSchema.nullable(),
  x: xProfileSchema.nullable(),
});
export type WorkspaceReport = z.infer<typeof workspaceReportSchema>;
export function tokenKey(target: WorkspaceConfig["target"]) {
  const t = gmgnTargetSchema.parse(target);
  return `${t.chain}:${t.address}`;
}
type Observations = {
  gmgn?: GmgnSnapshot | null;
  moni?: MoniSnapshot | null;
  x?: XProfile | null;
};
export function monitorSignals(current: Observations, previous: Observations) {
  const out: { code: string; text: string; source: "gmgn" | "moni" | "x" }[] =
    [];
  const g = current.gmgn,
    p = previous.gmgn;
  if (
    g &&
    p &&
    tokenKey(g.target) === tokenKey(p.target) &&
    Date.parse(g.observedAt) > Date.parse(p.observedAt)
  ) {
    const before = numericScore(gmgnStrategyInput(p)),
      after = numericScore(gmgnStrategyInput(g));
    const previousInput = gmgnStrategyInput(p);
    for (const veto of after.assessment.vetoes)
      if (
        !before.assessment.vetoes.includes(veto) &&
        (veto === "TOP10_22"
          ? previousInput.top10Pct != null
          : previousInput.bundlersPct != null &&
            previousInput.phishingPct != null)
      )
        out.push({
          code: `VETO_${veto}`,
          source: "gmgn",
          text:
            veto === "TOP10_22"
              ? "Новое вето: Top 10 ≥22%."
              : "Новое вето: сумма Bundlers + Phishing >50%. Это арифметическая сумма меток, не доля уникальных кошельков.",
        });
    const a = gmgnStrategyInput(g).watchers,
      b = gmgnStrategyInput(p).watchers;
    if (a != null && b != null && a < 100 && b >= 100)
      out.push({
        code: "WATCHERS_UNDER_100",
        source: "gmgn",
        text: `Наблюдатели GMGN: ${b} → ${a}, ниже 100.`,
      });
  }
  const m = current.moni,
    b = previous.moni;
  if (
    m &&
    b &&
    m.handle === b.handle &&
    Date.parse(m.observedAt) > Date.parse(b.observedAt)
  ) {
    if (m.score < b.score)
      out.push({
        code: "MONI_SCORE_DOWN",
        source: "moni",
        text: `Moni Score: ${b.score} → ${m.score}. Требуется проверка причин; конкретные отписки не подтверждены.`,
      });
    if (m.smarts !== null && b.smarts !== null && m.smarts < b.smarts)
      out.push({
        code: "MONI_SMARTS_DOWN",
        source: "moni",
        text: `Число smarts: ${b.smarts} → ${m.smarts}. Неполный список не устанавливает, кто отписался.`,
      });
  }
  if (current.x)
    out.push(
      ...compareXProfiles(current.x, previous.x ?? undefined).map((s) => ({
        ...s,
        source: "x" as const,
      })),
    );
  return out;
}

/** One due token per tick; missed intervals are not replayed after sleep. */
export function nextDueWorkspace(
  states: z.infer<typeof workspaceStateSchema>[],
  now: number,
  demo: boolean,
) {
  if (demo || !Number.isFinite(now)) return undefined;
  return states
    .filter(
      (s) =>
        s.config.monitor &&
        (!s.lastAttempt ||
          now - Date.parse(s.lastAttempt) >= s.config.intervalMinutes * 60000),
    )
    .sort(
      (a, b) =>
        (a.lastAttempt ? Date.parse(a.lastAttempt) : 0) -
        (b.lastAttempt ? Date.parse(b.lastAttempt) : 0),
    )[0];
}
