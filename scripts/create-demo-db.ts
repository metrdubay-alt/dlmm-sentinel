import path from "node:path";
import { openDatabase } from "../src/main/services/database";
import { AnalysisService } from "../src/main/services/analysis-service";
import { demoMint } from "../src/shared/providers/mock/fixtures";
import { scenarioSchema } from "../src/shared/schemas/domain";
const location =
  process.env.SENTINEL_DATA_DIR ??
  path.join(process.env.APPDATA ?? ".local", "DLMM Sentinel");
const db = await openDatabase(location, path.resolve("prisma/migrations"));
try {
  if (process.argv.includes("--seed")) {
    const svc = new AnalysisService(db);
    await svc.saveSettings({ ...(await svc.settings()), demoMode: true });
    for (const scenario of scenarioSchema.options)
      await svc.scan({
        mint: demoMint,
        scenario,
        mode: "quick",
        dataMode: "mock",
      });
  }
  console.log(`SQLite: ${location}`);
} finally {
  await db.$disconnect();
}
