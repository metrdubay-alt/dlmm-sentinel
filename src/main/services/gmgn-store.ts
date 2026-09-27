import type { Database } from "./database";
import {
  gmgnHistorySchema,
  gmgnSnapshotSchema,
  gmgnTargetSchema,
  type GmgnTarget,
  type GmgnSnapshot,
} from "../../shared/analysis/gmgn";
export class GmgnStore {
  constructor(private db: Database) {}
  async history(input: GmgnTarget) {
    const t = gmgnTargetSchema.parse(input);
    const row = await this.db.liveCache.findUnique({
      where: { key: `gmgn-history:${t.chain}:${t.address}` },
    });
    return row ? gmgnHistorySchema.parse(JSON.parse(row.snapshotJson)) : [];
  }
  async save(input: GmgnSnapshot) {
    const s = gmgnSnapshotSchema.parse(input),
      key = `gmgn-history:${s.target.chain}:${s.target.address}`;
    return this.db.$transaction(async (tx) => {
      const row = await tx.liveCache.findUnique({ where: { key } });
      const old = row
        ? gmgnHistorySchema.parse(JSON.parse(row.snapshotJson))
        : [];
      const history = [...old.filter((x) => x.observedAt !== s.observedAt), s]
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
