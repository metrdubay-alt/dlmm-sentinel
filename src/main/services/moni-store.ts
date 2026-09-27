import type { Database } from "./database";
import {
  moniHandleSchema,
  moniHistorySchema,
  moniSnapshotSchema,
  type MoniSnapshot,
} from "../../shared/analysis/moni";

export class MoniStore {
  constructor(private db: Database) {}
  async history(handle: string) {
    const key = `moni-history:${moniHandleSchema.parse(handle)}`;
    const row = await this.db.liveCache.findUnique({ where: { key } });
    return row ? moniHistorySchema.parse(JSON.parse(row.snapshotJson)) : [];
  }
  async save(input: MoniSnapshot) {
    const snapshot = moniSnapshotSchema.parse(input);
    const key = `moni-history:${snapshot.handle}`;
    // Serializable SQLite transaction prevents concurrent captures overwriting history.
    return this.db.$transaction(async (tx) => {
      const row = await tx.liveCache.findUnique({ where: { key } });
      const old = row
        ? moniHistorySchema.parse(JSON.parse(row.snapshotJson))
        : [];
      const history = [
        ...old.filter((s) => s.observedAt !== snapshot.observedAt),
        snapshot,
      ]
        .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
        .slice(-100);
      await tx.liveCache.upsert({
        where: { key },
        create: { key, snapshotJson: JSON.stringify(history) },
        update: { snapshotJson: JSON.stringify(history) },
      });
      return history;
    });
  }
}
