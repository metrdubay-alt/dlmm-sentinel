import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Database } from "../../main/services/database";
import { AnalysisService } from "../../main/services/analysis-service";
import { demoMint } from "../../shared/providers/mock/fixtures";
import { analyze } from "../../shared/analysis/analyze";
describe("Prisma / SQLite / pipeline", () => {
  let dir: string, db: Database, service: AnalysisService;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "sentinel-test-"));
    db = await openDatabase(dir, path.resolve("prisma/migrations"));
    service = new AnalysisService(db);
    await db.userSettings.create({
      data: {
        id: "local",
        settingsJson: JSON.stringify({
          ...(await service.settings()),
          demoMode: true,
        }),
      },
    });
  });
  afterAll(async () => {
    await db.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });
  it("сохраняет snapshots и воспроизводит детерминированный отчёт", async () => {
    const r = await service.scan({
      mint: demoMint,
      scenario: "concentration",
      mode: "quick",
    });
    expect((await service.list())[0]).toEqual(r);
    expect(await db.providerSnapshot.count({ where: { scanId: r.id } })).toBe(
      8,
    );
    expect(
      analyze(
        { mint: r.mint, scenario: r.scenario, mode: r.mode },
        r.snapshots,
        r.settings,
        r.generatedAt,
        r.id,
      ),
    ).toEqual(r);
  });
  it("наблюдения привязаны к mint, сохраняют версии и экспортируются", async () => {
    const r = await service.scan({
      mint: demoMint,
      scenario: "insufficient",
      mode: "quick",
    });
    const input = {
      mint: r.mint,
      description: "ДЕМО-ДАННЫЕ",
      projectType: "meme",
      observations: [],
      flags: [],
    };
    await expect(
      service.saveProspects({
        reportId: r.id,
        input: { ...input, mint: "wrong" },
      }),
    ).rejects.toThrow("Mint");
    const first = await service.saveProspects({ reportId: r.id, input });
    const second = await service.saveProspects({
      reportId: r.id,
      input: { ...input, description: "Вторая версия" },
    });
    expect(second.prospects).toHaveLength(2);
    expect(second.prospects![0]).toEqual(first.prospects![0]);
    expect(
      (await service.exportData()).reports.find((v) => v.id === r.id)
        ?.prospects,
    ).toEqual(second.prospects);
    expect(
      (await new AnalysisService(db).list()).find((v) => v.id === r.id)
        ?.prospects,
    ).toEqual(second.prospects);
    expect(second.score).toEqual(r.score);
  });
  it("review требует примечание, сохраняет veto и запрет, запрещает перезапись", async () => {
    const r = await service.scan({
      mint: demoMint,
      scenario: "mint-authority",
      mode: "quick",
    });
    const veto = r.vetoes.find((v) => v.triggered)!;
    await expect(
      service.review({ reportId: r.id, vetoId: veto.id, note: "   " }),
    ).rejects.toThrow();
    const reviewed = await service.review({
      reportId: r.id,
      vetoId: veto.id,
      note: "Проверено вручную: ограничение оставлено.",
    });
    expect(reviewed.vetoes.find((v) => v.id === veto.id)).toMatchObject({
      triggered: true,
      status: "REVIEWED",
    });
    expect(reviewed.suitability.verdict).toBe("DO_NOT_ENTER");
    await expect(
      service.review({ reportId: r.id, vetoId: veto.id, note: "Новое" }),
    ).rejects.toThrow();
  });
  it("устаревший review не затирает новую версию исследования", async () => {
    const r = await service.scan({
      mint: demoMint,
      scenario: "mint-authority",
      mode: "quick",
    });
    const stale = await db.scan.findUniqueOrThrow({ where: { id: r.id } });
    await service.saveProspects({
      reportId: r.id,
      input: {
        mint: r.mint,
        description: "Новая версия",
        projectType: "unknown",
        observations: [],
        flags: [],
      },
    });
    const spy = vi
      .spyOn(db.scan, "findUniqueOrThrow")
      .mockResolvedValueOnce(stale);
    try {
      await expect(
        service.review({
          reportId: r.id,
          vetoId: r.vetoes.find((v) => v.triggered)!.id,
          note: "Примечание из старой копии",
        }),
      ).rejects.toThrow("изменился");
    } finally {
      spy.mockRestore();
    }
    expect(
      (await service.list()).find((v) => v.id === r.id)?.prospects,
    ).toHaveLength(1);
  });
  it("сохраняет историю настроек и отключённый provider виден как недоступный", async () => {
    const settings = await service.settings();
    settings.providers.chain = false;
    await service.saveSettings(settings);
    const r = await service.scan({
      mint: demoMint,
      scenario: "new-token",
      mode: "deep",
    });
    expect(r.snapshots.find((s) => s.providerId === "chain")?.status).toBe(
      "unavailable",
    );
    expect(r.suitability.verdict).toBe("MANUAL_REVIEW");
    expect(await service.history()).toHaveLength(1);
  });
  it("не запускает два concurrent scan одного mint", async () => {
    const first = service.scan({
      mint: demoMint,
      scenario: "new-token",
      mode: "quick",
    });
    await expect(
      service.scan({ mint: demoMint, scenario: "social", mode: "quick" }),
    ).rejects.toThrow("уже выполняется");
    await first;
  });
  it("экспорт содержит все отчёты, удаление очищает связанные данные", async () => {
    expect((await service.exportData()).reports.length).toBeGreaterThan(0);
    await service.deleteData();
    expect(await service.list()).toEqual([]);
    expect(await db.evidence.count()).toBe(0);
    expect(await db.providerSnapshot.count()).toBe(0);
    expect((await service.settings()).providers.chain).toBe(true);
  });
  it("повторное открытие использует существующую миграцию", async () => {
    await db.$disconnect();
    db = await openDatabase(dir, path.resolve("prisma/migrations"));
    expect(await db.scan.count()).toBe(0);
  });
});
