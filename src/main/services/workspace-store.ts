import type { TransferFee } from "../../shared/analysis/transfer-fee";
import { grokResultSchema, type GrokResult } from "../../shared/analysis/grok";
import { mergeRelatedAccounts } from "../../shared/analysis/related-account";
import { z } from "zod";
import type { Database } from "./database";
import { gmgnTargetSchema } from "../../shared/analysis/gmgn";
import { GmgnStore } from "./gmgn-store";
import { MoniStore } from "./moni-store";
import { xProfileSchema, type XProfile } from "../../shared/analysis/x-browser";
import {
  workspaceConfigSchema,
  workspaceStateSchema,
  workspaceReportSchema,
  researchSchema,
  tokenKey,
  monitorSignals,
  type WorkspaceConfig,
  type WorkspaceReport,
} from "../../shared/analysis/workspace";
export class WorkspaceStore {
  constructor(private db: Database) {}
  private key(target: WorkspaceConfig["target"]) {
    return `workspace:${tokenKey(target)}`;
  }
  async list() {
    const rows = await this.db.liveCache.findMany({
      where: { key: { startsWith: "workspace:" } },
    });
    return rows.map((r) =>
      workspaceStateSchema.parse(JSON.parse(r.snapshotJson)),
    );
  }
  async remove(input: WorkspaceConfig["target"]) {
    const target = gmgnTargetSchema.parse(input);
    await this.db.liveCache.deleteMany({
      where: {
        key: {
          in: [
            this.key(target),
            `gmgn-history:${tokenKey(target)}`,
            `pool-snapshot:${tokenKey(target)}`,
          ],
        },
      },
    });
    return true;
  }
  async save(config: WorkspaceConfig) {
    const c = workspaceConfigSchema.parse(config),
      key = this.key(c.target);
    const old = await this.db.liveCache.findUnique({ where: { key } });
    if (!old && (await this.list()).length >= 20)
      throw new Error("Лимит: 20 токенов в наблюдении.");
    const state = old
      ? workspaceStateSchema.parse(JSON.parse(old.snapshotJson))
      : { config: c, lastAttempt: null, errors: {}, alerts: [], research: [] };
    state.config = c;
    await this.persist(state);
    return this.report(c.target);
  }
  private async persist(state: z.infer<typeof workspaceStateSchema>) {
    const s = workspaceStateSchema.parse(state),
      key = this.key(s.config.target);
    await this.db.liveCache.upsert({
      where: { key },
      create: { key, snapshotJson: JSON.stringify(s) },
      update: { snapshotJson: JSON.stringify(s) },
    });
  }
  async report(target: WorkspaceConfig["target"]): Promise<WorkspaceReport> {
    const row = await this.db.liveCache.findUnique({
      where: { key: this.key(target) },
    });
    if (!row) throw new Error("Сначала сохраните карточку токена.");
    const state = workspaceStateSchema.parse(JSON.parse(row.snapshotJson)),
      handle = state.config.handle;
    const [gmgn, moni, x] = await Promise.all([
      new GmgnStore(this.db).history(state.config.target),
      handle ? new MoniStore(this.db).history(handle) : [],
      handle ? this.xHistory(handle) : [],
    ]);
    return workspaceReportSchema.parse({
      ...state,
      gmgn: gmgn.at(-1) ?? null,
      moni: moni.at(-1) ?? null,
      x: x.at(-1) ?? null,
      relatedMoni: await Promise.all(
        [
          ...new Set((state.config.relatedAccounts ?? []).map((a) => a.handle)),
        ].map(async (handle) => ({
          handle,
          snapshot:
            (await new MoniStore(this.db).history(handle)).at(-1) ?? null,
        })),
      ),
    });
  }
  async xHistory(handle: string) {
    const key = `x-browser:${handle.toLowerCase()}`,
      row = await this.db.liveCache.findUnique({ where: { key } });
    return row
      ? z.array(xProfileSchema).max(100).parse(JSON.parse(row.snapshotJson))
      : [];
  }
  async saveX(input: XProfile) {
    const s = xProfileSchema.parse(input),
      key = `x-browser:${s.handle}`;
    const history = [
      ...(await this.xHistory(s.handle)).filter(
        (x) => x.observedAt !== s.observedAt,
      ),
      s,
    ]
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
      .slice(-100);
    await this.db.liveCache.upsert({
      where: { key },
      create: { key, snapshotJson: JSON.stringify(history) },
      update: { snapshotJson: JSON.stringify(history) },
    });
    return s;
  }
  async research(input: z.infer<typeof researchSchema>) {
    const r = researchSchema.parse(input),
      before = await this.report(r.target);
    const mint =
      r.target.chain !== "sol" ? r.input.mint.toLowerCase() : r.input.mint;
    if (mint !== r.target.address || r.handle !== before.config.handle)
      throw new Error("Исследование относится к другому токену или профилю.");
    const state = workspaceStateSchema.strip().parse(before);
    state.research = [...state.research, r].slice(-30);
    await this.persist(state);
    return this.report(r.target);
  }
  async saveGrok(input: GrokResult) {
    const result = grokResultSchema.parse(input),
      current = await this.report(result.target);
    if (result.handle !== current.config.handle)
      throw new Error("Профиль карточки изменён во время анализа Grok.");
    const state = workspaceStateSchema.strip().parse(current);
    state.grok = result;
    state.config.relatedAccounts = mergeRelatedAccounts(
      state.config.relatedAccounts,
      result.answer.relatedAccounts,
    );
    const retainedHandles = new Set(
      (state.config.relatedAccounts ?? []).map((a) => a.handle),
    );
    for (const key of Object.keys(state.errors)) {
      if (key.startsWith("moni:") && !retainedHandles.has(key.slice(5)))
        delete state.errors[key];
    }
    if (!state.config.handle && result.answer.discoveredProfile)
      state.config.handle = result.answer.discoveredProfile.handle;
    if (!state.config.label && result.answer.tokenSymbol)
      state.config.label = result.answer.tokenSymbol;
    await this.persist(state);
    return this.report(result.target);
  }
  async finish(
    before: WorkspaceReport,
    errors: Record<string, string>,
    at: string,
    transferFee?: TransferFee,
  ) {
    const current = await this.report(before.config.target);
    const state = workspaceStateSchema.strip().parse(current);
    const signals = monitorSignals(current, before);
    for (const [source, error] of Object.entries(errors))
      if (state.errors[source] !== error)
        signals.push({
          code: `SOURCE_${source.toUpperCase()}`,
          source:
            source === "gmgn" || source === "moni" || source === "x"
              ? source
              : "x",
          text: `Источник ${source}: ${error}`,
        });
    const events = signals.map((s, i) => ({
      ...s,
      id: `${at}:${i}:${s.code}`,
      at,
    }));
    if (transferFee) state.transferFee = transferFee;
    state.lastAttempt = at;
    state.errors = errors;
    state.alerts = [...state.alerts, ...events].slice(-200);
    await this.persist(state);
    return { report: await this.report(state.config.target), events };
  }
}
