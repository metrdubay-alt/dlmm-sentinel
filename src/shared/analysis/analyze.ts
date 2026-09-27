import {
  reportSchema,
  scanRequestSchema,
  settingsSchema,
  snapshotSchema,
  type Report,
  type ScanRequest,
  type Settings,
  type Snapshot,
} from "../schemas/domain";
import { SCORING_VERSION } from "../config/risk-thresholds";
import { vetoEngine } from "./veto-engine";
import { scoreEngine } from "./score-engine";
import { confidenceEngine } from "./confidence-engine";
import { lpSuitabilityEngine } from "./lp-suitability-engine";
export function analyze(
  input: ScanRequest,
  snapshots: Snapshot[],
  settings: Settings,
  now: string,
  id: string,
): Report {
  const request = scanRequestSchema.parse(input);
  const ctx = {
    snapshots: snapshots.map((s) => snapshotSchema.parse(s)),
    settings: settingsSchema.parse(settings),
    now,
  };
  const vetoes = vetoEngine(ctx),
    score = scoreEngine(ctx, request.position),
    confidence = confidenceEngine(ctx);
  const suitability = lpSuitabilityEngine(
    ctx,
    vetoes,
    score,
    confidence,
    request.position,
  );
  return reportSchema.parse({
    ...request,
    id,
    generatedAt: now,
    appVersion: "0.3.6",
    scoringVersion: SCORING_VERSION,
    sourceType: settings.demoMode ? "mock" : "live",
    settings: ctx.settings,
    snapshots: ctx.snapshots,
    vetoes,
    score,
    confidence,
    suitability,
  });
}
