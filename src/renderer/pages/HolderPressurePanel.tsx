import { holderPressure, type GmgnSnapshot } from "../../shared/analysis/gmgn";

export function HolderPressurePanel({ snapshot }: { snapshot: GmgnSnapshot }) {
  const data = snapshot.holders;
  const report = holderPressure(snapshot);
  return (
    <section className="panel">
      <h2>Потенциальное давление продаж</h2>
      <p>
        Все прочитанные держатели, независимо от метки Bundler. Это возможный
        объём продаж, а не прогноз намерений кошелька.
      </p>
      <p>
        {!data || data.state === "unavailable"
          ? "Таблица Holders не прочитана. Откройте её в окне GMGN и повторите чтение."
          : data.state === "empty"
            ? "GMGN вернул No Data. Это отсутствие доступной выборки, а не отсутствие риска."
            : `Неполная выборка: ${data.rows.length} уникальных адресов. Фильтр сайта может ограничивать список; для общей проверки снимите фильтры Wallet.`}
      </p>
      {!!data?.conflictingAddresses.length && (
        <p className="error">
          Исключено адресов с противоречащими строками:{" "}
          {data.conflictingAddresses.length}. Их суммы не складывались.
        </p>
      )}
      {!!data?.unidentifiedRows && (
        <p>
          Строк без подтверждённого полного адреса: {data.unidentifiedRows}. Они
          исключены из ранжирования.
        </p>
      )}
      {!!snapshot.poolAddresses?.length && (
        <p>
          Адреса пулов из ссылок GMGN исключены из рейтинга продавцов:{" "}
          {snapshot.poolAddresses.join(", ")}. Это не корректирует агрегатную
          долю бандлеров: её состав неизвестен.
        </p>
      )}
      {!!report.unknownBalanceCount && (
        <p>Адресов с неизвестным остатком: {report.unknownBalanceCount}.</p>
      )}
      <p>
        Ликвидность показанного GMGN пула:{" "}
        {snapshot.displayedPoolLiquidity?.display || "Нет данных"}. Отношение
        ниже относится только к этому пулу, не ко всем пулам и не является
        оценкой проскальзывания.
      </p>
      {(
        [
          ["Крупнейшие оставшиеся позиции", report.byPosition],
          ["Наибольшая нереализованная прибыль, USD", report.byProfit],
        ] as const
      ).map(([title, rows]) => (
        <div key={title}>
          <h3>{title} · среди прочитанных строк</h3>
          {!rows.length ? (
            <p>Нет подтверждённых строк для этой таблицы.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Адрес и метки GMGN</th>
                    <th>Остаток, USD / доля</th>
                    <th>Нереализованная прибыль, USD</th>
                    <th>Нереализованный ROI</th>
                    <th>Остаток / ликвидность пула</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.address}>
                      <td>
                        <code title={r.address}>
                          {r.address.slice(0, 6)}…{r.address.slice(-6)}
                        </code>
                        <br />
                        {r.tags.join(", ") || "Метки отсутствуют"}
                      </td>
                      <td>
                        {r.remainingUsd.precision === "rounded" ? "≈ " : ""}
                        {r.remainingUsd.display}
                        <br />
                        {r.remainingShare || "Доля неизвестна"}
                      </td>
                      <td>
                        {r.unrealizedUsd.precision === "rounded" ? "≈ " : ""}
                        {r.unrealizedUsd.display || "Нет данных"}
                      </td>
                      <td>
                        {r.unrealizedRoiPct === null
                          ? "Нет данных"
                          : `${r.unrealizedRoiPct}%`}
                      </td>
                      <td>
                        {r.positionToPoolPct === null
                          ? "Нет данных"
                          : `${r.remainingUsd.precision === "rounded" || snapshot.displayedPoolLiquidity?.precision === "rounded" ? "≈ " : ""}${r.positionToPoolPct.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
      <p>
        Суммы K/M/B приблизительны; порядок близких значений может отличаться.
        Нулевой отображаемый остаток не доказывает полное закрытие позиции. Роли
        адресов (пул, блокировка, биржа), связанные кошельки и последние продажи
        пока не подтверждены. Эти таблицы не меняют балл и не снимают вето.
      </p>
    </section>
  );
}
