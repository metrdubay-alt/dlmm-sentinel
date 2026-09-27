import { useState } from "react";
import { ProspectsPanel } from "./ProspectsPanel";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Tabs from "@radix-ui/react-tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from "recharts";
import {
  AlertTriangle,
  Copy,
  Download,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useUi } from "../stores/ui";
import { api, dateText, numberText } from "../lib/api";
import {
  categoryKeys,
  categoryLabels,
} from "../../shared/config/risk-thresholds";
import {
  verdictLabels,
  type Snapshot,
  type Veto,
} from "../../shared/schemas/domain";
import { scenarioLabels } from "../../shared/providers/mock/fixtures";
const tabs = [
  ["summary", "Итог"],
  ["veto", "Veto и риски"],
  ["chain", "On-chain"],
  ["holders", "Холдеры"],
  ["market", "Ликвидность"],
  ["social", "X / Social"],
  ["prospects", "Перспективность X"],
  ["url", "Ссылки"],
  ["lp", "DLMM LP"],
  ["sources", "Источники"],
] as const;
function SourceCard({ snapshot }: { snapshot: Snapshot }) {
  return (
    <section id={snapshot.evidenceId} className="source-card">
      <div className="section-heading">
        <h3>{snapshot.displayName}</h3>
        <span
          className={
            snapshot.status === "success" ? "pill neutral" : "pill amber"
          }
        >
          {snapshot.sourceType === "mock"
            ? "ДЕМО-ДАННЫЕ"
            : snapshot.sourceType === "cached"
              ? snapshot.stale
                ? "УСТАРЕВШИЙ КЭШ"
                : "КЭШ"
              : "РЕАЛЬНЫЙ ИСТОЧНИК"}{" "}
          ·{" "}
          {
            {
              success: "полный ответ",
              partial: "частичные данные",
              unavailable: "недоступно",
              error: "ошибка",
            }[snapshot.status]
          }
        </span>
      </div>
      <p>
        {snapshot.error?.message ??
          (snapshot.sourceType === "mock"
            ? "Синтетический fixture. Не подтверждает факты о введённом mint."
            : "Время получения ответа не гарантирует актуальность всех данных у провайдера.")}
      </p>
      <small>
        Получено: {dateText(snapshot.fetchedAt)} · Годно до:{" "}
        {dateText(snapshot.expiresAt)}
      </small>
      {Date.parse(snapshot.expiresAt) < Date.now() && (
        <p className="amber-text">
          Снимок устарел. Вывод рассчитан на момент сканирования.
        </p>
      )}
      <code className="evidence-id">{snapshot.evidenceId}</code>
      {snapshot.details?.notes.map((note, i) => (
        <p className="field-help" key={i}>
          {note}
        </p>
      ))}
      {snapshot.details?.identity && (
        <div className="metric-row">
          <span>Токен · supply в минимальных единицах</span>
          <b>
            {snapshot.details.identity.name ?? "Имя не получено"}{" "}
            {snapshot.details.identity.symbol ?? ""} ·{" "}
            {snapshot.details.identity.supplyRaw ?? "—"}
          </b>
        </div>
      )}
      {snapshot.details?.holderCount !== undefined && (
        <p>
          <b>
            Холдеров по данным источника:{" "}
            {numberText(snapshot.details.holderCount)}
          </b>
          . Методика подсчёта провайдера; это не число счетов в выборке RPC.
        </p>
      )}
      {snapshot.details?.marketCapUsd !== undefined && (
        <p>
          Market cap: {numberText(snapshot.details.marketCapUsd)} USD.{" "}
          {snapshot.details.holderCount
            ? `На одного холдера: ${numberText(snapshot.details.marketCapUsd / snapshot.details.holderCount)} USD. Это контекст, не оценка справедливой цены.`
            : ""}
        </p>
      )}
      {snapshot.details?.metrics?.map((m) => (
        <p key={m.label}>
          {m.label}:{" "}
          <b>
            {numberText(m.value)} {m.unit}
          </b>
        </p>
      ))}
      {!!snapshot.details?.wallets?.length && (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Кошелёк</th>
                <th>Метки GMGN</th>
                <th>Текущая доля supply</th>
                <th>Realized PnL, USD</th>
                <th>Unrealized PnL, USD</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.details.wallets.map((w) => (
                <tr key={w.address}>
                  <td>
                    <code>{w.address}</code>
                    {w.transferred && (
                      <small>
                        Есть входящий перевод: себестоимость не проверена
                      </small>
                    )}
                  </td>
                  <td>{w.tags.join(", ") || "—"}</td>
                  <td>{numberText(w.pct)}%</td>
                  <td>{numberText(w.realizedUsd)}</td>
                  <td>{numberText(w.unrealizedUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {snapshot.details?.sourceUpdatedAt && (
        <p>
          Дата снимка у источника: {dateText(snapshot.details.sourceUpdatedAt)}
        </p>
      )}
      {snapshot.details?.clusters?.map((c, i) => (
        <details key={i}>
          <summary>
            Кластер {i + 1}: {c.holderCount} холдеров · share (единицы API):{" "}
            {c.shareRaw}
          </summary>
          {c.holders.map((a) => (
            <p key={a}>
              <code>{a}</code>
            </p>
          ))}
        </details>
      ))}
      {snapshot.details?.social && (
        <div>
          <h3>Связь аккаунта с токеном и его активность</h3>
          {!snapshot.details.xProfiles?.length && (
            <p>
              Профиль не проверен. Наличие упоминаний mint не устанавливает
              официальный аккаунт.
            </p>
          )}
          {snapshot.details.xProfiles?.map((profile) => (
            <section className="source-card" key={profile.username}>
              <h4>@{profile.username} · заявленный аккаунт</h4>
              <p>
                <b>
                  {profile.identity === "MINT_MATCH"
                    ? "Точный mint найден в тексте аккаунта"
                    : "Связь с mint не подтверждена"}
                </b>
                . Независимая проверка владельца: не выполнена.
              </p>
              <p>
                Mint в описании:{" "}
                {profile.description !== undefined
                  ? profile.mintInBio
                    ? "найден"
                    : "не найден"
                  : "не проверено"}
                ; в прочитанных публикациях:{" "}
                {profile.observed7d !== undefined
                  ? profile.mintInPosts
                    ? "найден"
                    : "не найден"
                  : "не проверено"}
                .
              </p>
              <p>
                Создан:{" "}
                {profile.createdAt ? dateText(profile.createdAt) : "нет данных"}{" "}
                · Подписчиков: {numberText(profile.followers)}
              </p>
              <p>
                Прочитано за 7 дней: {numberText(profile.observed7d)}; за 30
                дней: {numberText(profile.observed30d)}.{" "}
                {profile.timelineComplete
                  ? "Доступная выдача за выбранный период прочитана."
                  : "История неполная: это не общее число постов за период."}
              </p>
              <p>
                Период истории: {dateText(profile.start)} —{" "}
                {dateText(profile.end)} · Страниц: {profile.pages}
              </p>
              {profile.error && <p className="amber-text">{profile.error}</p>}
              {profile.description && (
                <blockquote style={{ whiteSpace: "pre-wrap" }}>
                  {profile.description}
                </blockquote>
              )}
              {profile.notes.map((note, i) => (
                <p className="field-help" key={i}>
                  {note}
                </p>
              ))}
              <button
                className="text-button"
                onClick={() => void api.openExternal(profile.url)}
              >
                Открыть профиль
              </button>
              <p className="field-help">
                Заявленная ссылка из карточки DexScreener:{" "}
                {profile.discoveredFrom} (карточка DexScreener). Подписчики и
                теги не подтверждают репутацию.
              </p>
              <details>
                <summary>Публикации аккаунта ({profile.posts.length})</summary>
                {profile.posts.map((post) => (
                  <article className="info-note" key={post.id}>
                    <small>
                      {post.createdAt
                        ? dateText(post.createdAt)
                        : "Дата неизвестна"}
                    </small>
                    <p style={{ whiteSpace: "pre-wrap" }}>{post.text}</p>
                    {!!post.warningTerms.length && (
                      <p>
                        Слова для проверки: {post.warningTerms.join(", ")}. Это
                        не подтверждённые обвинения.
                      </p>
                    )}
                    <button
                      className="text-button"
                      onClick={() => void api.openExternal(post.url)}
                    >
                      Источник публикации
                    </button>
                  </article>
                ))}
              </details>
            </section>
          ))}
          <h4>
            X: упоминания адреса за {snapshot.details.social.periodDays} дней
          </h4>
          <p>
            {snapshot.details.social.posts.length} постов ·{" "}
            {snapshot.details.social.pages} страниц ·{" "}
            {snapshot.details.social.complete
              ? "Выдача прочитана"
              : "Неполная выдача"}
            . Период: {dateText(snapshot.details.social.start)} —{" "}
            {dateText(snapshot.details.social.end)}.
          </p>
          {snapshot.details.social.posts.length === 0 && (
            <p>
              {snapshot.details.social.pages === 0
                ? "Поиск упоминаний не выполнен. Нельзя делать вывод об отсутствии жалоб."
                : "Посты с точным mint не найдены в полученной выдаче. Другие формы упоминаний не проверены."}
            </p>
          )}
          {snapshot.details.social.posts.map((p) => (
            <article className="info-note" key={p.id}>
              <b>
                {p.username
                  ? `@${p.username}`
                  : (p.authorId ?? "Автор не раскрыт")}
              </b>{" "}
              · {p.createdAt ? dateText(p.createdAt) : "Дата не получена"}
              <p style={{ whiteSpace: "pre-wrap" }}>{p.text}</p>
              {!!p.warningTerms.length && (
                <p>
                  Требуют проверки слова: {p.warningTerms.join(", ")}.
                  Достоверность утверждений не установлена.
                </p>
              )}
              <button
                className="text-button"
                onClick={() => void api.openExternal(p.url)}
              >
                Открыть публикацию X
              </button>
            </article>
          ))}
        </div>
      )}
      {!!snapshot.details?.pools?.length && (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Пул / пара</th>
                <th>DEX</th>
                <th>Ликвидность, USD</th>
                <th>Объём 24ч</th>
                <th>Цена токена, USD</th>
                <th>Bin step / комиссии</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.details.pools.map((p) => (
                <tr key={p.address}>
                  <td>
                    {p.name}
                    <small>
                      <code>{p.address}</code>
                    </small>
                  </td>
                  <td>{p.dex}</td>
                  <td>{numberText(p.liquidityUsd)}</td>
                  <td>{numberText(p.volume24h)}</td>
                  <td>{numberText(p.priceUsd)}</td>
                  <td>
                    {numberText(p.binStep)} / {numberText(p.baseFeePct)}% +{" "}
                    {numberText(p.dynamicFeePct)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {snapshot.details?.pools?.length === 0 && (
        <p>Совпадающие пулы не найдены в полученной выдаче.</p>
      )}
      {!!snapshot.details?.holders?.length && (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Token account / владелец</th>
                <th>Количество, raw</th>
                <th>Доля supply</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.details.holders.map((h) => (
                <tr key={h.address}>
                  <td>
                    <code>{h.address}</code>
                    <small>{h.owner ?? "Владелец не раскрыт"}</small>
                  </td>
                  <td>{h.amountRaw}</td>
                  <td>{numberText(h.pct)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {snapshot.details?.risks?.map((risk, i) => (
        <p className="info-note" key={i}>
          <b>
            {risk.level} · {risk.name}
          </b>{" "}
          — {risk.description}
        </p>
      ))}
      <details>
        <summary>Нормализованные данные</summary>
        <pre>{JSON.stringify(snapshot.data ?? null, null, 2)}</pre>
      </details>
      <details>
        <summary>
          {snapshot.sourceType === "mock"
            ? "Исходный mock-ответ"
            : "Ответ провайдера (без ключей)"}
        </summary>
        <pre>{JSON.stringify(snapshot.rawResponse ?? null, null, 2)}</pre>
      </details>
      {snapshot.sourceUrls.map((url) => (
        <button
          className="text-button"
          key={url}
          onClick={() => void api.openExternal(url)}
        >
          {url}
        </button>
      ))}
    </section>
  );
}
function VetoCard({
  veto,
  reportId,
  onUpdate,
  onEvidence,
}: {
  veto: Veto;
  reportId: string;
  onUpdate: ReturnType<typeof useUi.getState>["setReport"];
  onEvidence: (id: string) => void;
}) {
  const [note, setNote] = useState("");
  const client = useQueryClient();
  const review = useMutation({
    mutationFn: () => api.review({ reportId, vetoId: veto.id, note }),
    onSuccess: (r) => {
      onUpdate(r);
      void client.invalidateQueries({ queryKey: ["reports"] });
    },
  });
  return (
    <article className={veto.triggered ? "veto-card triggered" : "veto-card"}>
      <div className="section-heading">
        <h3>{veto.titleRussian}</h3>
        <span className="pill amber">
          {veto.triggered
            ? "КРИТИЧЕСКИЙ"
            : veto.status === "INSUFFICIENT_DATA"
              ? "НЕТ ДАННЫХ"
              : "НЕ ОБНАРУЖЕН"}
        </span>
      </div>
      <code>{veto.id}</code>
      <p>{veto.reason}</p>
      <div className="evidence-links">
        {veto.evidenceIds.map((id) => (
          <button
            key={id}
            className="text-button"
            onClick={() => onEvidence(id)}
          >
            {id}
          </button>
        ))}
      </div>
      <small>
        Свежесть:{" "}
        {veto.freshness === "fresh"
          ? "свежие данные"
          : veto.freshness === "stale"
            ? "устаревшие данные"
            : "нет данных"}{" "}
        · Уверенность: {veto.confidence}%
      </small>
      {veto.triggered && (
        <>
          <p>
            Первое срабатывание: {dateText(veto.firstSeenAt!)} · Последнее:{" "}
            {dateText(veto.lastSeenAt!)}
          </p>
          {veto.reviewedAt ? (
            <div className="info-note">
              Просмотрено {dateText(veto.reviewedAt)}: {veto.reviewedNote}
              <br />
              Veto продолжает действовать.
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                review.mutate();
              }}
            >
              <label>
                Примечание к ручной проверке
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  required
                  maxLength={2000}
                  placeholder="Укажите основание и результат проверки"
                />
              </label>
              <button disabled={!note.trim() || review.isPending}>
                Отметить как просмотренное
              </button>
              {review.error && (
                <p role="alert" className="error">
                  {review.error.message}
                </p>
              )}
            </form>
          )}
        </>
      )}
    </article>
  );
}
export function ReportPage() {
  const { report: r, setReport, setPage } = useUi();
  const [tab, setTab] = useState("summary"),
    [evidence, setEvidence] = useState(""),
    [notice, setNotice] = useState("");
  const client = useQueryClient();
  const refresh = useMutation({
    mutationFn: () => {
      if (!r) throw new Error("Нет отчёта.");
      return api.scan({
        mint: r.mint,
        scenario: r.scenario,
        mode: r.mode,
        dataMode: r.sourceType,
        position: r.position,
      });
    },
    onSuccess: (report) => {
      setReport(report);
      void client.invalidateQueries({ queryKey: ["reports"] });
    },
  });
  if (!r)
    return (
      <section className="panel empty">
        <h1>Выберите или создайте отчёт</h1>
        <button onClick={() => setPage("scan")}>Начать анализ</button>
      </section>
    );
  const critical = r.vetoes.filter((v) => v.triggered),
    blocked = ["DO_NOT_ENTER", "EXIT_OR_MANUAL_REVIEW"].includes(
      r.suitability.verdict,
    ),
    source = (id: string) => r.snapshots.find((s) => s.providerId === id),
    showEvidence = (id: string) => {
      setEvidence(id);
      setTab("sources");
    };
  const chart = categoryKeys.map((category) => ({
    name: categoryLabels[category],
    points: r.score.categories[category],
    max: r.settings.weights[category],
  }));
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">
            ОТЧЁТ ·{" "}
            {r.sourceType === "mock" ? "ДЕМО-ДАННЫЕ" : "РЕАЛЬНЫЕ ИСТОЧНИКИ"}
          </span>
          <h1>
            {r.sourceType === "mock"
              ? scenarioLabels[r.scenario]
              : (r.snapshots.find((s) => s.details?.identity?.name)?.details
                  ?.identity?.name ?? "Анализ токена")}
          </h1>
          <div className="mint-line">
            <code>{r.mint}</code>
            <button
              aria-label="Копировать mint"
              onClick={() =>
                void navigator.clipboard
                  .writeText(r.mint)
                  .then(() => setNotice("Mint скопирован."))
                  .catch(() =>
                    setNotice(
                      "Не удалось скопировать. Выделите адрес вручную.",
                    ),
                  )
              }
            >
              <Copy size={14} />
            </button>
          </div>
          <p>
            {dateText(r.generatedAt)} · Возраст:{" "}
            {numberText(source("timing")?.data?.ageHours)} ч ·{" "}
            {r.scoringVersion}
          </p>
        </div>
        <div className="button-row">
          <button disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            <RefreshCw size={15} /> Обновить
          </button>
          <button
            onClick={() =>
              void api
                .exportData(undefined)
                .then((ok) =>
                  setNotice(ok ? "Отчёты экспортированы." : "Экспорт отменён."),
                )
                .catch((e) => setNotice(String(e)))
            }
          >
            <Download size={15} /> Экспорт
          </button>
        </div>
      </div>
      {notice && <p role="status">{notice}</p>}
      {refresh.error && (
        <p className="error" role="alert">
          {refresh.error.message}
        </p>
      )}
      {critical.length > 0 && (
        <section className="critical-banner">
          <ShieldAlert size={28} />
          <div>
            <b>Обнаружены критические риски: {critical.length}</b>
            <p>Баллы не отменяют veto. Ручная отметка не снимает запрет.</p>
          </div>
          <button onClick={() => setTab("veto")}>Проверить основания</button>
        </section>
      )}
      <div className="verdict-grid">
        <section
          className={"panel verdict " + (blocked ? "danger-border" : "")}
        >
          <span className="eyebrow">ПРИГОДНОСТЬ ДЛЯ DLMM</span>
          <h2 className={blocked ? "red-text" : "amber-text"}>
            {verdictLabels[r.suitability.verdict]}
          </h2>
          {r.suitability.reasons.map((x) => (
            <p key={x}>{x}</p>
          ))}
          <small>
            Оценка по доступным{" "}
            {r.sourceType === "mock" ? "демо-данным" : "данным источников"};
            отсутствие rug pull не гарантируется.
          </small>
        </section>
        <section className="panel score-card">
          <span>
            {r.sourceType === "live"
              ? "Итоговый риск"
              : "Риск + неопределённость"}
          </span>
          <strong className={blocked ? "red-text" : "amber-text"}>
            {r.sourceType === "live" ? "N/A" : r.score.total}
            {r.sourceType === "mock" && <small>/100</small>}
          </strong>
          <div className="meter">
            <i
              style={{
                width: `${r.sourceType === "live" ? 0 : r.score.total}%`,
              }}
            />
          </div>
          <small>
            {r.sourceType === "live"
              ? "Обязательные проверки не завершены. Внутренний старый score включает неизвестность и не является оценкой риска dump. "
              : ""}
            Факторы:{" "}
            {numberText(
              r.score.contributions
                .filter((c) => !c.unknown)
                .reduce((a, c) => a + c.points, 0),
            )}{" "}
            · Неизвестность:{" "}
            {numberText(
              r.score.contributions
                .filter((c) => c.unknown)
                .reduce((a, c) => a + c.points, 0),
            )}
          </small>
        </section>
        <section className="panel score-card">
          <span>Достоверность данных</span>
          <strong className={r.confidence.total < 60 ? "amber-text" : "teal"}>
            {r.confidence.total}
            <small>/100</small>
          </strong>
          <div className="meter teal-meter">
            <i style={{ width: `${r.confidence.total}%` }} />
          </div>
          <small>Полнота и свежесть источников</small>
        </section>
      </div>
      {r.confidence.total < 60 && (
        <div className="info-note">
          <AlertTriangle size={16} /> Недостаточная достоверность. Нельзя
          считать пропуски положительным результатом.
        </div>
      )}
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="tabs" aria-label="Разделы отчёта">
          {tabs.map(([id, label]) => (
            <Tabs.Trigger key={id} value={id}>
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="prospects">
          <ProspectsPanel key={r.id} report={r} />
        </Tabs.Content>
        <Tabs.Content value="summary">
          <div className="report-grid">
            <section className="panel">
              <h2>
                {r.sourceType === "live"
                  ? "Технические вклады прежней модели"
                  : "Структура риска"}
              </h2>
              <p>
                {r.sourceType === "live"
                  ? "Здесь учитывается и отсутствие данных. График не является оценкой вероятности dump; итоговая оценка пока N/A."
                  : "Суммарные вклады с ограничением максимума категории."}
              </p>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={chart}
                    layout="vertical"
                    margin={{ left: 0, right: 25 }}
                  >
                    <XAxis
                      type="number"
                      domain={[
                        0,
                        Math.max(...Object.values(r.settings.weights)),
                      ]}
                      hide
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={165}
                      tick={{ fill: "#aebcd0", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#141e2b",
                        border: "1px solid #314052",
                        color: "#fff",
                      }}
                    />
                    <Bar
                      dataKey="points"
                      name="Баллы"
                      radius={[0, 4, 4, 0]}
                      barSize={12}
                      isAnimationActive={false}
                    >
                      {chart.map((x, i) => (
                        <Cell
                          key={x.name}
                          fill={
                            i === 0 && critical.length ? "#ef7e85" : "#56cbb9"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {chart.map((x) => (
                <div className="metric-row" key={x.name}>
                  <span>{x.name}</span>
                  <b>
                    {numberText(x.points)} / {x.max}
                  </b>
                </div>
              ))}
            </section>
            <section className="panel">
              <h2>Почему такой вердикт</h2>
              {r.suitability.softVetoes.length ? (
                r.suitability.softVetoes.map((x) => (
                  <div className="finding" key={x}>
                    <AlertTriangle size={16} />
                    <p>{x}</p>
                  </div>
                ))
              ) : (
                <p>Мягкие ограничения не обнаружены по доступным данным.</p>
              )}
              <h3>Качество доказательств</h3>
              {r.confidence.components.map((c) => (
                <div className="metric-row" key={c.id}>
                  <span>
                    {c.id === "consistency"
                      ? "Согласованность"
                      : source(c.id)?.displayName}
                    <small>{c.reason}</small>
                  </span>
                  <b>
                    {c.points}/{c.maximum}
                  </b>
                </div>
              ))}
              {r.confidence.conflicts.map((x) => (
                <p className="error" key={x}>
                  {x}
                </p>
              ))}
            </section>
          </div>
          <section className="panel">
            <h2>Все начисления</h2>
            {r.score.contributions.map((c) => (
              <div className="contribution" key={c.ruleId}>
                <div>
                  <code>{c.ruleId}</code>
                  <p>{c.explanation}</p>
                  <small>
                    {categoryLabels[c.category]} · {dateText(c.timestamp)} ·
                    {c.sourceType === "mock"
                      ? "ДЕМО-ДАННЫЕ"
                      : c.sourceType === "cached"
                        ? "КЭШ"
                        : "РЕАЛЬНЫЕ ДАННЫЕ"}{" "}
                    · Уверенность {c.confidence}%
                  </small>
                  <div className="evidence-links">
                    {c.evidenceIds.map((id) => (
                      <button
                        className="text-button"
                        onClick={() => showEvidence(id)}
                        key={id}
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                </div>
                <b className={c.unknown ? "amber-text" : "teal"}>
                  +{numberText(c.points)}
                  <small>из {c.categoryMaximum}</small>
                  {c.points !== c.rawPoints && (
                    <small>до лимита: {c.rawPoints}</small>
                  )}
                </b>
              </div>
            ))}
            {!r.score.contributions.length && (
              <p>
                Баллы не начислены по доступным данным. Это не подтверждение
                безопасности.
              </p>
            )}
          </section>
        </Tabs.Content>
        <Tabs.Content value="veto">
          <p className="muted">
            Просмотр не удаляет срабатывание. История предыдущих сканов доступна
            на экране «Обзор».
          </p>
          {r.vetoes.map((v) => (
            <VetoCard
              key={v.id}
              veto={v}
              reportId={r.id}
              onUpdate={setReport}
              onEvidence={showEvidence}
            />
          ))}
        </Tabs.Content>
        {(["chain", "holders", "market", "social", "url"] as const).map(
          (id) => (
            <Tabs.Content key={id} value={id}>
              <section className="panel">
                <h2>{source(id)?.displayName}</h2>
                {id === "holders" && (
                  <p>
                    {r.sourceType === "mock"
                      ? "Связи кошельков вероятностны. В fixture представлены агрегаты, а не реальные адреса. Исключения допустимы только при надёжной маркировке."
                      : "Показана выборка крупнейших token accounts. Связи с инсайдерами не установлены; доли пулов и бирж не исключены."}
                  </p>
                )}
                {id === "social" && (
                  <p>
                    {r.sourceType === "mock"
                      ? "Синтетические сигналы. "
                      : "Охват и найденные публикации приведены ниже. "}
                    Лайк, подписка или упоминание не означают инвестицию или
                    одобрение. Наличие API-ответа не завершает проверку
                    подлинности и репутации.
                  </p>
                )}
                {id === "url" && (
                  <p>
                    Ссылки не открываются автоматически. Реальная проверка
                    доменов не подключена.
                  </p>
                )}
                {id === "market" && (
                  <div className="stat-grid">
                    <div className="stat">
                      <span>Ликвидность, USD</span>
                      <strong>
                        {numberText(source(id)?.data?.liquidityUsd)}
                      </strong>
                    </div>
                    <div className="stat">
                      <span>Объём за 24 ч, USD</span>
                      <strong>{numberText(source(id)?.data?.volumeUsd)}</strong>
                    </div>
                  </div>
                )}
                {id === "chain" && (
                  <div className="metric-row">
                    <span>Mint / Freeze authority</span>
                    <b>
                      {source(id)?.data?.mintAuthority === "revoked"
                        ? "Mint отозвана"
                        : source(id)?.data?.mintAuthority ===
                            "active-unverified"
                          ? "Mint активна, не проверена"
                          : "Статус в источнике"}{" "}
                      /{" "}
                      {source(id)?.data?.freezeAuthority === "revoked"
                        ? "Freeze отозвана"
                        : "Статус в источнике"}
                    </b>
                  </div>
                )}
                {source(id) && <SourceCard snapshot={source(id)!} />}
                {id === "holders" &&
                  ["scanner", "gmgn", "bubblemaps"].map((extra) => {
                    const s = r.snapshots.find((s) => s.providerId === extra);
                    return s ? <SourceCard key={extra} snapshot={s} /> : null;
                  })}
              </section>
            </Tabs.Content>
          ),
        )}
        <Tabs.Content value="lp">
          {source("meteora") && (
            <section className="panel">
              <h2>Пулы Meteora DLMM</h2>
              <SourceCard snapshot={source("meteora")!} />
            </section>
          )}
          <section className="panel">
            <h2>Контекст DLMM-позиции</h2>
            {!r.position && (
              <p>Параметры позиции не заданы. Выполнен общий анализ токена.</p>
            )}
            <div className="metric-row">
              <span>Доля позиции в ликвидности</span>
              <b>
                {r.suitability.exposureRatio === null
                  ? "Нет данных"
                  : numberText(r.suitability.exposureRatio * 100) + "%"}
              </b>
            </div>
            <div className="metric-row">
              <span>
                Потенциальное давление инсайдеров / исполнимая ликвидность
              </span>
              <b>{numberText(r.suitability.insiderPressureRatio)}</b>
            </div>
            <div className="metric-row">
              <span>Объём / ликвидность</span>
              <b>{numberText(r.suitability.volumeLiquidityRatio)}</b>
            </div>
            <div className="metric-row">
              <span>Риск выхода из диапазона</span>
              <b>
                {
                  {
                    LOW: "Низкий",
                    MEDIUM: "Средний",
                    HIGH: "Высокий",
                    EXTREME: "Экстремальный",
                    UNKNOWN: "Недостаточно данных",
                  }[r.suitability.rangeRisk]
                }
              </b>
            </div>
            {r.suitability.warnings.map((w) => (
              <p className="info-note" key={w}>
                {w}
              </p>
            ))}
            {r.position && (
              <>
                <p>
                  Горизонт: {r.position.horizonHours} ч · Размер: $
                  {numberText(r.position.amountUsd)} · Допустимый убыток:{" "}
                  {r.position.maxLossPct}%
                </p>
                <p>
                  Указанный предел убытка не исполняется автоматически.
                  Доходность и impermanent loss не прогнозируются.
                </p>
              </>
            )}
          </section>
        </Tabs.Content>
        <Tabs.Content value="sources">
          <section className="panel">
            <h2>Источники и воспроизводимость</h2>
            <p>
              Снимки, настройки и версия правил сохранены локально. Для
              повторного расчёта используется время исходного скана.
            </p>
            {evidence && (
              <div className="info-note">
                Выбранное доказательство: {evidence}
              </div>
            )}
            {[...r.snapshots]
              .sort(
                (a, b) =>
                  Number(b.evidenceId === evidence) -
                  Number(a.evidenceId === evidence),
              )
              .map((s) => (
                <SourceCard key={s.providerId} snapshot={s} />
              ))}
            <details>
              <summary>Настройки этого отчёта</summary>
              <pre>{JSON.stringify(r.settings, null, 2)}</pre>
            </details>
          </section>
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}
