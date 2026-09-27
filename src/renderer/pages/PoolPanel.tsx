import { useState, type CSSProperties } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, dateText } from "../lib/api";
import { rankPools, poolNetwork } from "../../shared/analysis/pool-snapshot";
import type { GmgnTarget } from "../../shared/analysis/gmgn";
const usd = (n: number | null) =>
  n == null
    ? "—"
    : `$${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`;
const pct = (n: number | null) =>
  n == null
    ? "—"
    : `${n.toLocaleString("ru-RU", { maximumFractionDigits: 4 })}%`;
const dailyPct = (n: number | null) =>
  n == null
    ? "—"
    : `${n.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
export function PoolPanel({
  target,
  demo,
  pipelineBusy,
}: {
  target: GmgnTarget;
  demo: boolean;
  pipelineBusy?: boolean;
}) {
  const [window, setWindow] = useState<"5m" | "1h">("5m");
  const client = useQueryClient(),
    key = ["pool-snapshot", target];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.poolsLatest(target),
  });
  const refresh = useMutation({
    mutationFn: () => api.poolsRefresh(target),
    onSuccess: (v) => client.setQueryData(["pool-snapshot", v.target], v),
  });
  const snapshot =
    query.data?.target.chain === target.chain &&
    query.data.target.address === target.address
      ? query.data
      : null;
  const scoreKey = window === "5m" ? "efficiency5m" : "efficiency1h";
  const meteora = snapshot?.source === "Meteora";
  const ranked = rankPools(
    (snapshot?.rows ?? []).filter((p) => (p.tvlUsd ?? 0) > 1000),
    window,
  ).slice(0, 10);
  const maxScore = Math.max(
    0,
    ...ranked
      .filter((p) => (p.tvlUsd ?? 0) > 1000)
      .map((p) => p[scoreKey] ?? 0),
  );
  const sums = (k: "sum5mUsd" | "sum1hUsd") =>
    !snapshot?.rows.length || snapshot.rows.some((r) => r[k] == null)
      ? null
      : snapshot.rows.reduce((sum, r) => sum + r[k]!, 0);
  return (
    <section className="panel">
      <h2>3. Объёмы и эффективность пулов</h2>
      <div className="button-row">
        <button
          className="primary"
          disabled={demo || pipelineBusy || refresh.isPending}
          onClick={() => refresh.mutate()}
        >
          {refresh.isPending
            ? "Получаю пулы и минутные объёмы…"
            : "Обновить пулы"}
        </button>
        <label>
          Сортировка{" "}
          <select
            aria-label="Сортировка пулов"
            value={window}
            onChange={(e) => setWindow(e.target.value as "5m" | "1h")}
          >
            <option value="5m">Fee/TVL за 5 минут</option>
            <option value="1h">Fee/TVL за час</option>
          </select>
        </label>
      </div>
      {(query.error || refresh.error) && (
        <p role="alert">{(query.error || refresh.error)?.message}</p>
      )}
      {!snapshot && (
        <p>
          Нажмите «Обновить пулы». Источник:{" "}
          {target.chain === "sol" ? "Meteora" : "GeckoTerminal"}.
        </p>
      )}
      {snapshot && (
        <>
          <p>
            {snapshot.source} · {dateText(snapshot.observedAt)} · найдено{" "}
            {snapshot.discoveredCount ?? snapshot.rows.length} пулов
            {snapshot.discoveryComplete ? "" : " · неполный список"}.
          </p>
          <p>
            <b>
              Объём проверенных активных пулов: 5 минут {usd(sums("sum5mUsd"))}{" "}
              · 1 час {usd(sums("sum1hUsd"))}
            </b>
          </p>
          <p>
            {meteora
              ? "Завершённые 5-минутные интервалы до "
              : "Сумма завершённых минутных объёмов до "}
            {dateText(new Date(snapshot.endEpochSeconds * 1000).toISOString())};
            пулы с TVL &gt; $1 000. Показаны до 10 лучших по выбранному Fee/TVL.
          </p>
          <p>
            {meteora
              ? "Fee/TVL = объём × (Fee + Dynamic Fee) / Active TVL — формула «Пулы приоритет»."
              : "Fee/TVL = объём × Fee / общий TVL."}{" "}
            Это сравнительный показатель, не доходность позиции. 24ч — пересчёт
            при сохранении темпа: 5м × 288 или 1ч × 24, без сложного процента.
          </p>
          <div className="pool-legend">
            <span className="pool-gradient" />
            Слабее → эффективнее · Fee/TVL {window === "5m" ? "5м" : "1ч"} ↓
            <span>Цвет — сравнение пулов, не оценка безопасности</span>
          </div>
          <div className="pool-table-scroll">
            <table className="pool-table">
              <thead>
                <tr>
                  <th className="pool-rank">№</th>
                  <th>Пул / DEX</th>
                  <th
                    className={window === "5m" ? "pool-active-column" : ""}
                    aria-sort={window === "5m" ? "descending" : undefined}
                  >
                    Fee/TVL 5м {window === "5m" ? "↓" : ""}
                  </th>
                  <th
                    className={window === "1h" ? "pool-active-column" : ""}
                    aria-sort={window === "1h" ? "descending" : undefined}
                  >
                    Fee/TVL 1ч {window === "1h" ? "↓" : ""}
                  </th>
                  <th>TVL</th>
                  {meteora && <th>Active TVL</th>}
                  {meteora && <th>Bin</th>}
                  <th>Fee</th>
                  {meteora && <th>Dynamic Fee</th>}
                  <th>Объём 5м</th>
                  {meteora && (
                    <>
                      <th>$/мин · 5м</th>
                      <th>Объём 10м</th>
                      <th>Объём 30м</th>
                      <th>Δ темпа</th>
                    </>
                  )}
                  <th>Объём 1ч</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((p, index) => {
                  const score = p[scoreKey];
                  const eligible = (p.tvlUsd ?? 0) > 1000;
                  const strength =
                    eligible && score != null && maxScore > 0
                      ? score / maxScore
                      : 0;
                  const style = {
                    "--pool-strength": strength,
                    "--pool-tint": strength > 0 ? 0.04 + strength * 0.18 : 0,
                  } as CSSProperties;
                  return (
                    <tr
                      key={p.address}
                      style={style}
                      className={score == null ? "pool-unrated" : ""}
                    >
                      <td className="pool-rank">{index + 1}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() =>
                            void api.openExternal(
                              meteora
                                ? `https://app.meteora.ag/${p.poolType === "dlmm" ? "dlmm" : "dammv2"}/${p.address}`
                                : `https://www.geckoterminal.com/${poolNetwork(target)}/pools/${p.address}`,
                            )
                          }
                        >
                          {p.name || p.address.slice(0, 10)}
                        </button>
                        <small>{p.dex}</small>
                        <small>
                          Fee {pct(p.feePct)}
                          {p.binStep != null ? ` · Bin ${p.binStep}` : ""}
                        </small>
                      </td>
                      <td
                        className={
                          window === "5m"
                            ? "pool-score pool-score-active"
                            : "pool-score"
                        }
                      >
                        <span>{pct(p.efficiency5m)}</span>
                        <small title="Fee/TVL за 5 минут × 288 — за 24 часа при сохранении темпа">
                          24ч:{" "}
                          {dailyPct(
                            p.efficiency5m == null
                              ? null
                              : p.efficiency5m * 288,
                          )}
                        </small>
                        {window === "5m" && <i className="pool-score-bar" />}
                      </td>
                      <td
                        className={
                          window === "1h"
                            ? "pool-score pool-score-active"
                            : "pool-score"
                        }
                      >
                        <span>{pct(p.efficiency1h)}</span>
                        <small title="Fee/TVL за час × 24 — за 24 часа при сохранении темпа">
                          24ч:{" "}
                          {dailyPct(
                            p.efficiency1h == null ? null : p.efficiency1h * 24,
                          )}
                        </small>
                        {window === "1h" && <i className="pool-score-bar" />}
                      </td>
                      <td>{usd(p.tvlUsd)}</td>
                      {meteora && <td>{usd(p.activeTvlUsd ?? null)}</td>}
                      {meteora && <td>{p.binStep ?? "—"}</td>}
                      <td>
                        {pct(p.feePct)}
                        {p.feeSource === "name" ? " *" : ""}
                      </td>
                      {meteora && <td>{pct(p.dynamicFeePct ?? null)}</td>}
                      <td>{usd(p.sum5mUsd)}</td>
                      {meteora && (
                        <>
                          <td>
                            {usd(p.sum5mUsd == null ? null : p.sum5mUsd / 5)}
                          </td>
                          <td>{usd(p.sum10mUsd ?? null)}</td>
                          <td>{usd(p.sum30mUsd ?? null)}</td>
                          <td
                            style={{
                              color:
                                p.volumeMomentumPct == null
                                  ? undefined
                                  : p.volumeMomentumPct >= 0
                                    ? "#86efac"
                                    : "#fca5a5",
                            }}
                          >
                            {pct(p.volumeMomentumPct ?? null)}
                          </td>
                        </>
                      )}
                      <td>{usd(p.sum1hUsd)}</td>
                      <td className="pool-status">
                        {p.tvlUsd != null && p.tvlUsd <= 1000
                          ? "TVL ≤ $1 000"
                          : p.issue || "OK"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>* Ставка взята из названия пула. «—» — данных для расчёта нет.</p>
        </>
      )}
    </section>
  );
}
