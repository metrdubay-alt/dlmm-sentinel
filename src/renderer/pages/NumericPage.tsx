import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  gmgnTargetSchema,
  gmgnStrategyInput,
  type GmgnSnapshot,
  type GmgnTarget,
} from "../../shared/analysis/gmgn";
import { numericScore } from "../../shared/analysis/numeric-score";
import { api, dateText } from "../lib/api";
import { HolderPressurePanel } from "./HolderPressurePanel";
import { feeDisplay } from "../lib/fee-display";
export const metricLabels: Record<keyof GmgnSnapshot["metrics"], string> = {
  top10Pct: "Top 10, %",
  bundlersPct: "Бандлеры · удерживаемая доля, %",
  phishingPct: "Phishing, %",
  holderCount: "Холдеры",
  marketCapUsd: "Капитализация, USD",
  volume5mUsd: "Суммарный объём за 5 минут, USD",
  volume1hUsd: "Суммарный объём за 1 час, USD",
  totalFeesSolEquivalent: "Total Fees, эквивалент SOL",
  snipersPct: "Снайперы, %",
  devPct: "Доля разработчика, %",
};
export const ruleLabels: Record<string, string> = {
  VOLUME_RED: "Объём ниже red flag-порога стратегии",
  HOLDERS_RED: "Холдеров меньше минимума для капитализации",
  FEES_RED: "Slowcook: Total Fees меньше 100 SOL в эквиваленте",
  HOLDER_GROWTH_RED: "Нет положительного роста холдеров Runner",
  holderThreshold: "Капитализация для порога холдеров",
  watchers: "Количество наблюдателей GMGN",
  WATCHERS_RED:
    "Красный флаг: менее 100 наблюдателей GMGN (−10 баллов, не вето)",
  WATCHERS_LOW: "100–199 наблюдателей GMGN: −5 баллов",
  TOP10_22: "Top 10 ≥ 22% — вето",
  COMBINED_50: "Бандлеры + Phishing > 50% — red flag",
  TOP10_REDUCTION: "Top 10 выше 15%: снижение балла",
  bundlersPct_OVER_20: "Бандлеры > 20%",
  phishingPct_OVER_20: "Phishing > 20%",
  BUNDLER_UNREALIZED_ROI_OVER_1000:
    "У бандлера нереализованный ROI > 1000% при остатке токенов",
  NO_HOLDER_THRESHOLD_FOR_CAP:
    "Для этой капитализации порог холдеров пока не задан",
  classification: "Возраст токена и капитализация для рекомендации",
  bundlerProfitTop10: "Полный top-10 нереализованной прибыли бандлеров",
  top10Pct: "Точная доля Top 10",
  bundlersPct: "Точная удерживаемая доля бандлеров",
  phishingPct: "Доля Phishing",
  marketCapUsd: "Точная капитализация",
  volume5m: "Объём за 5 минут",
  holders: "Количество холдеров",
  holderGrowth: "Рост холдеров",
  totalFees: "Total Fees",
  marketCap: "Капитализация слоукука",
};
export function NumericPage() {
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState<"sol" | "bsc">("sol");
  const [selected, setSelected] = useState<GmgnTarget | null>(null);
  const [message, setMessage] = useState("");
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings(undefined),
  });
  const demo = settings.data?.demoMode ?? true;
  const history = useQuery({
    queryKey: ["gmgn", selected],
    queryFn: () => api.gmgnHistory(selected!),
    enabled: !!selected,
  });
  const action = useMutation({
    mutationFn: async ({
      kind,
      target,
    }: {
      kind: "open" | "capture";
      target: GmgnTarget;
    }) =>
      kind === "open"
        ? (await api.gmgnOpen(target), null)
        : api.gmgnCapture(target),
    onSuccess: (rows, { target }) => {
      if (rows) {
        client.setQueryData(["gmgn", target], rows);
        setMessage("Снимок прочитан и сохранён.");
      } else
        setMessage(
          "Дождитесь загрузки карточки в окне GMGN, затем нажмите «Прочитать и оценить». Вход нужен только если сам сайт закрывает данные.",
        );
    },
    onError: (e) => setMessage(e.message),
  });
  function run(kind: "open" | "capture" | "history") {
    const parsed = gmgnTargetSchema.safeParse({
      chain,
      address: address.trim(),
    });
    if (!parsed.success) {
      setMessage("Введите полный адрес токена выбранной сети: Solana или BSC.");
      return;
    }
    setSelected(parsed.data);
    setMessage("");
    if (kind !== "history") action.mutate({ kind, target: parsed.data });
    else
      void client.invalidateQueries({
        queryKey: ["gmgn", parsed.data],
      });
  }
  const rows = history.data ?? [],
    latest = rows.at(-1),
    score = latest ? numericScore(gmgnStrategyInput(latest)) : null;
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">ЧИСЛОВЫЕ ПРАВИЛА ТОКЕНА</span>
          <h1>GMGN · анализ распределения</h1>
          <p>Сначала токен целиком. Выбор LP-пула — отдельный этап.</p>
        </div>
      </div>
      <section className="panel">
        <label>
          Сеть
          <select
            aria-label="Сеть GMGN"
            value={chain}
            disabled={action.isPending}
            onChange={(e) => {
              setChain(e.target.value as "sol" | "bsc");
              setSelected(null);
            }}
          >
            <option value="sol">Solana</option>
            <option value="bsc">BNB Smart Chain</option>
          </select>
          Адрес токена
          <input
            aria-label="Адрес токена GMGN"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={action.isPending}
            placeholder="Полный адрес, не тикер"
          />
        </label>
        <div className="button-row">
          <button
            disabled={demo || action.isPending}
            onClick={() => run("open")}
          >
            Открыть GMGN
          </button>
          <button
            disabled={demo || action.isPending}
            onClick={() => run("capture")}
          >
            Прочитать и оценить
          </button>
          <button disabled={action.isPending} onClick={() => run("history")}>
            История GMGN
          </button>
        </div>
        {demo && (
          <p>
            Для обращения к сайту сохраните режим «Реальные источники» в
            настройках. В демо-режиме сайт не открывается.
          </p>
        )}
        {message && (
          <p role="status" className="info-note">
            {message}
          </p>
        )}
        {action.isPending && <p role="status">Обработка…</p>}
        {history.error && (
          <p role="alert" className="error">
            {history.error.message}
          </p>
        )}
      </section>
      {latest && score && (
        <>
          <section className="panel">
            <h2>
              {score.assessment.vetoes.length
                ? "ВЕТО · не проходит правила входа"
                : "ПРОВЕРКА НЕ ЗАВЕРШЕНА"}
            </h2>
            <p>
              <code>{latest.target.address}</code>
            </p>
            <p>
              РЕАЛЬНЫЙ СНИМОК GMGN ·{" "}
              {latest.target.chain === "sol" ? "Solana" : "BSC"} ·{" "}
              {dateText(latest.observedAt)}. Это сохранённое состояние, не
              непрерывная проверка.
            </p>
            {latest.nativeFees && (
              <p>
                Total Fees в GMGN: {feeDisplay(latest.nativeFees.amount)}{" "}
                {latest.nativeFees.asset}. Порог слоукука: 150 SOL в
                эквиваленте.
                {latest.feeConversion ? (
                  <>
                    {" "}
                    Курс CoinGecko: 1 {latest.nativeFees.asset} = $
                    {latest.feeConversion.nativeUsd}; 1 SOL = $
                    {latest.feeConversion.solUsd}. Время котировок:{" "}
                    {dateText(latest.feeConversion.nativeUpdatedAt)} /{" "}
                    {dateText(latest.feeConversion.solUpdatedAt)}. Сумма: $
                    {feeDisplay({
                      value: latest.feeConversion.usd,
                      display: "",
                    })}
                    .
                  </>
                ) : latest.nativeFees.asset !== "SOL" ? (
                  " Свежий курс не получен — проверка комиссий неизвестна."
                ) : (
                  ""
                )}
              </p>
            )}
            {score.assessment.vetoes.map((v) => (
              <p className="error" key={v}>
                {ruleLabels[v] ?? v}
              </p>
            ))}
            <p>
              Режим:{" "}
              {score.assessment.classification.mode === "unknown"
                ? "не определён — не хватает подтверждённой истории торгов"
                : score.assessment.classification.mode === "runner"
                  ? "Runner"
                  : "Слоукук"}
              .
            </p>
            <div className="stat-grid">
              <div className="stat">
                <span>Числовая оценка · выше лучше</span>
                <strong>
                  {score.total === null
                    ? "Неполная"
                    : `${score.total.toFixed(1)} / 100`}
                </strong>
              </div>
              <div className="stat">
                <span>Баллы по известным критериям</span>
                <strong>
                  {score.earned.toFixed(1)} / {score.coveredWeight}
                </strong>
              </div>
              <div className="stat">
                <span>Возможный итог с неизвестными данными</span>
                <strong>
                  {score.lower.toFixed(1)}–{score.upper.toFixed(1)} / 100
                </strong>
              </div>
            </div>
            <p>
              Начальная шкала для калибровки, не вероятность dump. Высокий балл
              не отменяет вето. Покрытие весов не равно достоверности источника.
            </p>
            <p>
              Наблюдатели GMGN (глаз):{" "}
              {latest.watchers?.display || "Нет данных"}. Поправка:{" "}
              {score.watchers.adjustment === null
                ? "неизвестна"
                : `${score.watchers.adjustment > 0 ? "+" : ""}${score.watchers.adjustment} баллов`}
              . Менее 100: −10 и красный флаг; 100–199: −5; 200–400: 0; выше
              400: +5. Поправка применяется после базовых баллов, итог ограничен
              0–100. Это не подтверждённое число уникальных людей.
            </p>
            {score.assessment.warnings.map((w) => (
              <p key={w}>{ruleLabels[w] ?? w}</p>
            ))}
          </section>
          <section className="panel">
            <h2>Показатели и точность</h2>
            <table>
              <thead>
                <tr>
                  <th>Показатель</th>
                  <th>GMGN показывает</th>
                  <th>Использование</th>
                </tr>
              </thead>
              <tbody>
                {(
                  Object.entries(latest.metrics) as [
                    keyof GmgnSnapshot["metrics"],
                    GmgnSnapshot["metrics"]["top10Pct"],
                  ][]
                ).map(([key, m]) => (
                  <tr key={key}>
                    <td>{metricLabels[key]}</td>
                    <td>
                      {key === "totalFeesSolEquivalent"
                        ? feeDisplay(m)
                        : m.display || "Нет данных"}
                    </td>
                    <td>
                      {m.precision === "display"
                        ? key === "totalFeesSolEquivalent"
                          ? "Показано целым · расчёт по точному значению"
                          : "Без дополнительного округления"
                        : m.precision === "rounded"
                          ? "Приблизительно · исключено из точных порогов"
                          : "Нет подтверждённого значения"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Выбранное окно объёма: {latest.volumePeriod || "не определено"}.
              Дата создания токена по сайту:{" "}
              {latest.createdAtDisplay || "нет данных"}; это не подтверждённая
              дата первого торга.
            </p>
            <button
              onClick={() =>
                void api
                  .openExternal(latest.sourceUrl)
                  .catch((e) => setMessage(String(e)))
              }
            >
              Открыть источник
            </button>
          </section>
          <HolderPressurePanel snapshot={latest} />
          <section className="panel">
            <h2>Что ещё нужно проверить</h2>
            <ul>
              {score.assessment.missing.map((id) => (
                <li key={id}>{ruleLabels[id] ?? id}</li>
              ))}
            </ul>
            <p>
              Социальный анализ X/Grok, кластеризация и ранжирование LP-пулов в
              этот числовой снимок пока не включены.
            </p>
            <details>
              <summary>Как начислены баллы</summary>
              <table>
                <thead>
                  <tr>
                    <th>Критерий</th>
                    <th>Баллы</th>
                  </tr>
                </thead>
                <tbody>
                  {score.components.map((c) => (
                    <tr key={c.label}>
                      <td>{c.label}</td>
                      <td>
                        {c.points === null ? "Неизвестно" : c.points.toFixed(1)}{" "}
                        / {c.max}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            <details>
              <summary>Ограничения источника</summary>
              <ul>
                {latest.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </details>
            <details>
              <summary>История · {rows.length} снимков</summary>
              <table>
                <thead>
                  <tr>
                    <th>Время чтения</th>
                    <th>Top 10</th>
                    <th>Холдеры</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows].reverse().map((r) => (
                    <tr key={r.observedAt}>
                      <td>{dateText(r.observedAt)}</td>
                      <td>{r.metrics.top10Pct.display || "Нет данных"}</td>
                      <td>{r.metrics.holderCount.display || "Нет данных"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>
        </>
      )}
    </>
  );
}
