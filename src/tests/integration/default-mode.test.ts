import { it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../../main/services/database";
import { AnalysisService } from "../../main/services/analysis-service";
it("fresh installations start live and preserve an explicit demo choice after reopen", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-live-default-"));
  let db = await openDatabase(dir, path.resolve("prisma/migrations"));
  try {
    const service = new AnalysisService(db);
    expect((await service.settings()).demoMode).toBe(false);
    await service.saveSettings({
      ...(await service.settings()),
      demoMode: true,
    });
    await db.$disconnect();
    db = await openDatabase(dir, path.resolve("prisma/migrations"));
    expect((await new AnalysisService(db).settings()).demoMode).toBe(true);
  } finally {
    await db.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }
});
