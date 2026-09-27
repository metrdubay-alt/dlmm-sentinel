import { randomUUID } from "node:crypto";
import { commands } from "../../shared/schemas/ipc";
import { analyze } from "../../shared/analysis/analyze";
import {
  defaultSettings,
  reportSchema,
  reviewSchema,
  scanRequestSchema,
  settingsSchema,
  type Report,
} from "../../shared/schemas/domain";
import { fetchDemoSnapshots } from "../../shared/providers/provider-registry";
import type { Database } from "./database";
import { LiveProviders } from "../providers/live";
import { DatabaseCache } from "./live-cache";
export class AnalysisService {
  private inFlight = new Map<string, Promise<Report>>();
  constructor(
    private db: Database,
    private live = new LiveProviders(new DatabaseCache(db)),
  ) {}
  async settings() {
    const row = await this.db.userSettings.findUnique({
      where: { id: "local" },
    });
    return row
      ? settingsSchema.parse(JSON.parse(row.settingsJson))
      : structuredClone(defaultSettings);
  }
  async saveSettings(input: unknown) {
    const settings = settingsSchema.parse(input);
    const before = await this.settings();
    await this.db.$transaction([
      this.db.userSettings.upsert({
        where: { id: "local" },
        create: { id: "local", settingsJson: JSON.stringify(settings) },
        update: { settingsJson: JSON.stringify(settings) },
      }),
      this.db.settingsChange.create({
        data: {
          id: randomUUID(),
          beforeJson: JSON.stringify(before),
          afterJson: JSON.stringify(settings),
        },
      }),
    ]);
    return settings;
  }
  async history() {
    return this.db.settingsChange.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    });
  }
  async list() {
    return (
      await this.db.scan.findMany({
        orderBy: { completedAt: "desc" },
        take: 50,
      })
    ).map((s) => reportSchema.parse(JSON.parse(s.reportJson)));
  }
  async scan(input: unknown): Promise<Report> {
    const request = scanRequestSchema.parse(input);
    if (this.inFlight.has(request.mint))
      throw new Error(
        "Анализ этого mint уже выполняется. Дождитесь результата.",
      );
    if (this.inFlight.size >= 2)
      throw new Error("Уже выполняются два анализа. Дождитесь завершения.");
    const task = this.execute(request);
    this.inFlight.set(request.mint, task);
    try {
      return await task;
    } finally {
      this.inFlight.delete(request.mint);
    }
  }
  private async execute(request: ReturnType<typeof scanRequestSchema.parse>) {
    const settings = await this.settings(),
      now = new Date().toISOString(),
      id = randomUUID();
    if (
      request.dataMode &&
      request.dataMode !== (settings.demoMode ? "mock" : "live")
    )
      throw new Error(
        "Режим изменился. Откройте новый анализ с актуальными настройками.",
      );
    const snapshots = settings.demoMode
      ? await fetchDemoSnapshots(
          { mint: request.mint, scenario: request.scenario, now },
          settings,
        )
      : await this.live.fetch(request, settings);
    const report = analyze(
      request,
      snapshots,
      settings,
      settings.demoMode ? now : new Date().toISOString(),
      id,
    );
    const identity = snapshots.find((s) => s.details?.identity?.name)?.details
      ?.identity;
    await this.db.$transaction(async (tx) => {
      await tx.token.upsert({
        where: { mint: report.mint },
        create: {
          mint: report.mint,
          symbol: settings.demoMode ? "DEMO" : (identity?.symbol ?? ""),
          name: settings.demoMode
            ? "Демонстрационный сценарий"
            : (identity?.name ?? ""),
          metadataJson: "{}",
          firstSeenAt: new Date(now),
        },
        update: {},
      });
      await tx.scan.create({
        data: {
          id,
          tokenMint: report.mint,
          scanMode: report.mode,
          status: "complete",
          startedAt: new Date(now),
          completedAt: new Date(report.generatedAt),
          riskScore: report.score.total,
          confidenceScore: report.confidence.total,
          verdict: report.suitability.verdict,
          criticalVetoCount: report.vetoes.filter((v) => v.triggered).length,
          reportJson: JSON.stringify(report),
          appVersion: report.appVersion,
          scoringVersion: report.scoringVersion,
        },
      });
      for (const s of snapshots) {
        await tx.providerSnapshot.create({
          data: {
            id: randomUUID(),
            scanId: id,
            provider: s.providerId,
            status: s.status,
            rawResponseJson: JSON.stringify(s.rawResponse ?? null),
            normalizedResponseJson: JSON.stringify(s.data ?? null),
            errorJson: JSON.stringify(s.error ?? null),
            fetchedAt: new Date(s.fetchedAt),
            expiresAt: new Date(s.expiresAt),
          },
        });
        await tx.evidence.create({
          data: {
            id: `${id}:${s.evidenceId}`,
            scanId: id,
            provider: s.providerId,
            sourceType: s.sourceType,
            content: JSON.stringify(s.data ?? null),
            rawJson: JSON.stringify(s.rawResponse ?? null),
            confidence: s.confidence,
            fetchedAt: new Date(s.fetchedAt),
          },
        });
      }
      for (const v of report.vetoes)
        await tx.vetoFinding.create({
          data: {
            id: `${id}:${v.id}`,
            scanId: id,
            vetoCode: v.id,
            triggered: v.triggered,
            explanation: v.reason,
            evidenceIdsJson: JSON.stringify(v.evidenceIds),
            confidence: v.confidence,
          },
        });
      for (const v of report.score.contributions)
        await tx.scoreContribution.create({
          data: {
            id: `${id}:${v.ruleId}`,
            scanId: id,
            category: v.category,
            ruleId: v.ruleId,
            points: v.points,
            maxCategoryPoints: v.categoryMaximum,
            explanation: v.explanation,
            evidenceIdsJson: JSON.stringify(v.evidenceIds),
            confidence: v.confidence,
          },
        });
    });
    return report;
  }
  async review(input: unknown) {
    const req = reviewSchema.parse(input);
    const row = await this.db.scan.findUniqueOrThrow({
      where: { id: req.reportId },
    });
    const report = reportSchema.parse(JSON.parse(row.reportJson));
    const veto = report.vetoes.find((v) => v.id === req.vetoId && v.triggered);
    if (!veto) throw new Error("Активный veto не найден.");
    if (veto.reviewedAt)
      throw new Error("Примечание уже сохранено и не может быть перезаписано.");
    const reviewedAt = new Date().toISOString();
    veto.reviewedAt = reviewedAt;
    veto.reviewedNote = req.note;
    veto.status = "REVIEWED";
    await this.db.$transaction(async (tx) => {
      const updated = await tx.scan.updateMany({
        where: { id: report.id, reportJson: row.reportJson },
        data: { reportJson: JSON.stringify(report) },
      });
      if (updated.count !== 1)
        throw new Error(
          "Отчёт изменился. Откройте его заново и повторите сохранение.",
        );
      await tx.vetoFinding.update({
        where: { id: `${report.id}:${veto.id}` },
        data: {
          reviewedAt: new Date(reviewedAt),
          reviewedNote: veto.reviewedNote,
        },
      });
    });
    return report;
  }
  async exportData() {
    return {
      workspace: (
        await this.db.liveCache.findMany({
          where: { key: { startsWith: "workspace:" } },
        })
      ).map((row) => ({
        key: row.key,
        data: JSON.parse(row.snapshotJson) as unknown,
      })),
      xBrowserHistory: (
        await this.db.liveCache.findMany({
          where: { key: { startsWith: "x-browser:" } },
        })
      ).map((row) => ({
        key: row.key,
        snapshots: JSON.parse(row.snapshotJson) as unknown,
      })),
      gmgnHistory: (
        await this.db.liveCache.findMany({
          where: { key: { startsWith: "gmgn-history:" } },
        })
      ).map((row) => ({
        key: row.key,
        snapshots: JSON.parse(row.snapshotJson) as unknown,
      })),
      moniHistory: (
        await this.db.liveCache.findMany({
          where: { key: { startsWith: "moni-history:" } },
        })
      ).map((row) => ({
        key: row.key,
        snapshots: JSON.parse(row.snapshotJson) as unknown,
      })),
      version: 1,
      settings: await this.settings(),
      settingsHistory: await this.db.settingsChange.findMany(),
      reports: (await this.db.scan.findMany()).map((s) =>
        reportSchema.parse(JSON.parse(s.reportJson)),
      ),
    };
  }
  async saveProspects(value: unknown) {
    const req = commands.saveProspects.input.parse(value);
    return this.db.$transaction(async (tx) => {
      const row = await tx.scan.findUniqueOrThrow({
        where: { id: req.reportId },
      });
      const report = reportSchema.parse(JSON.parse(row.reportJson));
      if (report.mint !== req.input.mint)
        throw new Error("Mint наблюдений не совпадает с отчётом.");
      if ((report.prospects?.length ?? 0) >= 100)
        throw new Error("Достигнут предел 100 версий наблюдений для отчёта.");
      report.prospects = [
        ...(report.prospects ?? []),
        {
          savedAt: new Date().toISOString(),
          model: "x-prospects-v1",
          input: req.input,
        },
      ];
      await tx.scan.update({
        where: { id: report.id },
        data: { reportJson: JSON.stringify(report) },
      });
      return report;
    });
  }
  async deleteData() {
    if (this.inFlight.size)
      throw new Error("Дождитесь завершения анализов перед удалением.");
    await this.db.$transaction([
      this.db.scoreContribution.deleteMany(),
      this.db.vetoFinding.deleteMany(),
      this.db.evidence.deleteMany(),
      this.db.providerSnapshot.deleteMany(),
      this.db.alert.deleteMany(),
      this.db.watchlistItem.deleteMany(),
      this.db.lpPositionProfile.deleteMany(),
      this.db.scan.deleteMany(),
      this.db.token.deleteMany(),
      this.db.settingsChange.deleteMany(),
      this.db.userSettings.deleteMany(),
      this.db.liveCache.deleteMany(),
    ]);
  }
}
