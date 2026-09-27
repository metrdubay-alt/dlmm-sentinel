import { snapshotSchema, type Snapshot } from "../../shared/schemas/domain";
import type { Database } from "./database";
import type { SnapshotCache } from "../providers/live";
export class DatabaseCache implements SnapshotCache {
  constructor(private db: Database) {}
  async get(key: string) {
    const row = await this.db.liveCache.findUnique({ where: { key } });
    if (!row) return undefined;
    const snapshot = snapshotSchema.parse(JSON.parse(row.snapshotJson));
    if (
      snapshot.sourceType === "mock" ||
      Date.now() - Date.parse(snapshot.fetchedAt) > 86400000
    )
      return undefined;
    return snapshot;
  }
  async put(key: string, snapshot: Snapshot) {
    const snapshotJson = JSON.stringify(snapshot);
    await this.db.liveCache.upsert({
      where: { key },
      create: { key, snapshotJson },
      update: { snapshotJson },
    });
    await this.db.liveCache.deleteMany({
      where: {
        updatedAt: { lt: new Date(Date.now() - 86400000) },
        NOT: {
          OR: [
            { key: { startsWith: "moni-history:" } },
            { key: { startsWith: "gmgn-history:" } },
            { key: { startsWith: "workspace:" } },
            { key: { startsWith: "x-browser:" } },
          ],
        },
      },
    });
  }
}
