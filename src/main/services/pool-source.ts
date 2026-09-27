import { gmgnTargetSchema, type GmgnTarget } from "../../shared/analysis/gmgn";
import { captureMeteora } from "./meteora-pools";
import {
  parsePoolPage,
  withPoolCandles,
  poolNetwork,
  poolSnapshotSchema,
  type PoolRow,
} from "../../shared/analysis/pool-snapshot";
export class PoolSource {
  private calls: number[] = [];
  private next = 0;
  private cache = new Map<
    string,
    { at: number; complete: boolean; page: number; rows: Map<string, PoolRow> }
  >();
  constructor(private fetcher: typeof fetch = fetch) {}
  private async get(path: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      this.calls = this.calls.filter((t) => Date.now() - t < 61000);
      const budget = this.calls.length >= 24 ? this.calls[0] + 61000 : 0;
      const wait = Math.max(0, this.next - Date.now(), budget - Date.now());
      if (wait) await new Promise((r) => setTimeout(r, wait));
      this.calls.push(Date.now());
      this.next = Date.now() + 2600;
      const r = await this.fetcher(
        `https://api.geckoterminal.com/api/v2${path}`,
        { redirect: "error", signal: AbortSignal.timeout(15000) },
      );
      if (r.status === 429) {
        this.next = Date.now() + 65000;
        if (!attempt) continue;
        throw new Error("Лимит GeckoTerminal. Повторите через минуту.");
      }
      if (!r.ok) throw new Error(`GeckoTerminal HTTP ${r.status}`);
      return r.json() as Promise<unknown>;
    }
    throw new Error("Лимит GeckoTerminal");
  }
  async capture(input: GmgnTarget) {
    const target = gmgnTargetSchema.parse(input),
      network = poolNetwork(target);
    if (target.chain === "sol") return captureMeteora(target, this.fetcher);
    const key = `${network}:${target.address}`;
    let state = this.cache.get(key);
    if (!state || Date.now() - state.at >= 300000) {
      state = { at: Date.now(), complete: false, page: 1, rows: new Map() };
      if (this.cache.size >= 20)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, state);
    }
    while (!state.complete && state.page <= 10) {
      const raw = await this.get(
        `/networks/${network}/tokens/${target.address}/pools?page=${state.page}&sort=h24_volume_usd_desc`,
      );
      const found = parsePoolPage(raw, target);
      for (const row of found) state.rows.set(row.address, row);
      const count = (raw as { data: unknown[] }).data.length;
      state.page++;
      if (count < 20 || (found.length > 0 && found.at(-1)?.volume24hUsd === 0))
        state.complete = true;
    }
    const candidates = [...state.rows.values()].filter(
      (p) =>
        p.tvlUsd != null &&
        p.tvlUsd > 1000 &&
        (p.volume1hUsd == null || p.volume1hUsd > 0),
    );
    const rows = new Map<string, PoolRow>();
    // Refresh metadata in batches, independent of the five-minute discovery cache.
    for (let i = 0; i < candidates.length; i += 20) {
      const batch = candidates.slice(i, i + 20);
      const raw = await this.get(
        `/networks/${network}/pools/multi/${batch.map((p) => p.address).join(",")}`,
      );
      for (const row of parsePoolPage(raw, target)) {
        if (
          batch.some((p) => p.address === row.address) &&
          (row.tvlUsd ?? 0) > 1000 &&
          (row.volume1hUsd == null || row.volume1hUsd > 0)
        )
          rows.set(row.address, row);
      }
    }
    // One minute for publication latency; all pools use the same completed windows.
    const end = Math.floor(Date.now() / 60000) * 60 - 60;
    for (const p of rows.values()) {
      try {
        const raw = await this.get(
          `/networks/${network}/pools/${p.address}/ohlcv/minute?aggregate=1&limit=65&currency=usd&include_empty_intervals=true&before_timestamp=${end - 1}`,
        );
        rows.set(p.address, withPoolCandles(p, raw, end));
      } catch (error) {
        rows.set(p.address, {
          ...p,
          issue:
            error instanceof Error
              ? error.message
              : "Не удалось получить минутные объёмы",
        });
      }
    }
    return poolSnapshotSchema.parse({
      target,
      source: "GeckoTerminal",
      observedAt: new Date().toISOString(),
      endEpochSeconds: end,
      discoveryComplete: state.complete,
      discoveredCount: state.rows.size,
      rows: [...rows.values()],
    });
  }
}
