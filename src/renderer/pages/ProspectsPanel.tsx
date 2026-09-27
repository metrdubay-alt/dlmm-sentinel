import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  assessProspects,
  criteria,
  prospectsInputSchema,
  type ProspectsInput,
} from "../../shared/analysis/prospects";
import type { Report } from "../../shared/schemas/domain";
import { api, dateText, numberText } from "../lib/api";
import { useUi } from "../stores/ui";

export function ProspectsPanel({ report }: { report: Report }) {
  const latest = report.prospects?.at(-1);
  const [draft, setDraft] = useState<ProspectsInput>(
    latest?.input ?? {
      mint: report.mint,
      description: "",
      projectType: "unknown",
      observations: [],
      flags: [],
    },
  );
  const [json, setJson] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!latest);
  const setReport = useUi((s) => s.setReport);
  const query = useQueryClient();
  const result = latest ? assessProspects(latest.input) : null;
  const update = (
    id: string,
    patch: Partial<ProspectsInput["observations"][number]>,
  ) =>
    setDraft((d) => {
      const old = d.observations.find((o) => o.criterion === id) ?? {
        criterion: id,
        level: 0 as const,
        explanation: "",
        source: "",
        observedAt: new Date().toISOString(),
      };
      return {
        ...d,
        observations: [
          ...d.observations.filter((o) => o.criterion !== id),
          { ...old, ...patch },
        ],
      };
    });
  async function save() {
    setError("");
    setBusy(true);
    try {
      prospectsInputSchema.parse(draft);
      const saved = await api.saveProspects({
        reportId: report.id,
        input: draft,
      });
      setReport(saved);
      await query.invalidateQueries({ queryKey: ["reports"] });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel prospects-panel">
      <h2>Перспективность X и проекта</h2>
      <p className="info-note">
        {report.sourceType === "mock" ? "ДЕМО-ДАННЫЕ · " : ""}Ручное
        исследование без X API. Приложение рассчитывает баллы по вашим
        наблюдениям; ссылки автоматически не проверяются.
      </p>
      <p>
        Это отдельная оценка перспективности: выше — лучше. Она не разрешает
        вход в DLMM и не заменяет проверку холдеров, бандлеров и ликвидности.
      </p>
      {result && latest && (
        <>
          <h3>1. Описание</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {latest.input.description || "Описание не предоставлено"}
          </p>
          <p>
            Тип:{" "}
            {
              {
                unknown: "Не установлен",
                product: "Продукт с ролью токена",
                "no-value-capture": "Продукт без подтверждённого дохода токена",
                meme: "Мем",
                hybrid: "Гибрид",
              }[latest.input.projectType]
            }
          </p>
          <h3>
            2. Балльная оценка:{" "}
            {result.score === null ? "N/A" : `${numberText(result.score)}/100`}
          </h3>
          <p>{result.outcome}</p>
          <p>
            Набрано {numberText(result.earned)}; изучено {result.covered}/100
            веса модели. Возможный диапазон: {numberText(result.earned)}–
            {numberText(result.upper)}. Покрытие не означает достоверность.
          </p>
          <p>{result.provenance}</p>
          <small>
            Версия {report.prospects?.length} · {dateText(latest.savedAt)} ·{" "}
            {latest.model}
          </small>
          <table>
            <thead>
              <tr>
                <th>Параметр</th>
                <th>Баллы</th>
                <th>Основание и источник</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.group}: {r.label}
                  </td>
                  <td>
                    {r.earned === null
                      ? "Нет данных"
                      : `${numberText(r.earned)}/${r.maximum}`}
                  </td>
                  <td>
                    {r.observation ? (
                      <>
                        {r.observation.explanation}
                        <br />
                        <small>{dateText(r.observation.observedAt)}</small>
                        <br />
                        <button
                          className="text-button"
                          onClick={() =>
                            void api.openExternal(r.observation!.source)
                          }
                        >
                          {r.observation.source}
                        </button>
                      </>
                    ) : (
                      "Не исследовано"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>3. Red flags и положительные признаки</h3>
          <p>
            Все записи ниже — сведения пользователя, без независимого
            подтверждения.
          </p>
          {latest.input.flags.length === 0 ? (
            <p>Наблюдения не внесены. Это не означает отсутствие угроз.</p>
          ) : (
            latest.input.flags.map((f, i) => (
              <div className="source-card" key={i}>
                <b>
                  {f.severity === "critical"
                    ? "КРИТИЧЕСКОЕ СООБЩЕНИЕ"
                    : f.severity === "warning"
                      ? "Подозрение"
                      : "Положительное наблюдение"}
                </b>
                <p>{f.text}</p>
                <small>{dateText(f.observedAt)}</small>
                <p>{f.source}</p>
              </div>
            ))
          )}
          <h3>Что проверить дальше</h3>
          <ol>
            {latest.input.flags.some((f) => f.severity === "critical") && (
              <li>
                Проверить сообщение о критической угрозе до входа; не подключать
                кошелёк к подозрительным ссылкам.
              </li>
            )}
            {result.rows
              .filter((r) => !r.observation)
              .slice(0, 3)
              .map((r) => (
                <li key={r.id}>
                  {r.label}: {r.help}
                </li>
              ))}
            <li>
              Сопоставить социальные выводы с концентрацией связанных кошельков,
              действиями deployer и глубиной выбранного пула.
            </li>
            <li>
              Повторить проверку через 24 часа: состав участников, ссылки,
              крупные продажи и изменения LP.
            </li>
          </ol>
          <details>
            <summary>История версий ({report.prospects?.length})</summary>
            {report.prospects?.map((r, i) => (
              <details key={i}>
                <summary>
                  Версия {i + 1} · {dateText(r.savedAt)}
                </summary>
                <pre style={{ whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(r.input, null, 2)}
                </pre>
              </details>
            ))}
          </details>
        </>
      )}
      <button onClick={() => setEditing(!editing)}>
        {editing ? "Скрыть редактор" : "Дополнить исследование"}
      </button>
      {editing && (
        <div>
          <h3>Наблюдения и источники</h3>
          <label>
            Тип проекта
            <select
              value={draft.projectType}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  projectType: e.target.value as ProspectsInput["projectType"],
                })
              }
            >
              <option value="unknown">Не установлен</option>
              <option value="product">Работающий продукт с ролью токена</option>
              <option value="no-value-capture">
                Продукт без подтверждённого дохода токена
              </option>
              <option value="meme">Мем</option>
              <option value="hybrid">Гибрид</option>
            </select>
          </label>
          <label>
            Описание проекта и хронология
            <textarea
              rows={6}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              placeholder="Что за проект; тренд; дата запуска токена отдельно от регистрации X и Community; число подписчиков; Moni score с датой; роли инфлюенсеров; выплаты и права DLMM LP. Факты снабдите ссылками в критериях ниже."
            />
          </label>
          <p>
            Шкала: 0 — проверенное отсутствие или отрицательный факт; 25 —
            слабые основания; 50 — смешанные; 75 — сильные с ограничениями; 100
            — полностью обосновано. Без источника оставляйте «Нет данных». Не
            оценивайте один факт в нескольких пунктах.
          </p>
          {criteria.map((c) => {
            const o = draft.observations.find((o) => o.criterion === c.id);
            return (
              <details className="source-card" key={c.id}>
                <summary>
                  {c.group} · {c.label} ({c.maximum} баллов) —{" "}
                  {o ? `${o.level}%` : "Нет данных"}
                </summary>
                <p>{c.help}</p>
                <label>
                  Оценка: {c.label}
                  <select
                    value={o?.level ?? ""}
                    onChange={(e) => {
                      if (e.target.value === "")
                        setDraft({
                          ...draft,
                          observations: draft.observations.filter(
                            (o) => o.criterion !== c.id,
                          ),
                        });
                      else
                        update(c.id, {
                          level: Number(e.target.value) as
                            0 | 25 | 50 | 75 | 100,
                        });
                    }}
                  >
                    <option value="">Нет данных</option>
                    {[0, 25, 50, 75, 100].map((n) => (
                      <option key={n} value={n}>
                        {n}%
                      </option>
                    ))}
                  </select>
                </label>
                {o && (
                  <>
                    <label>
                      Обоснование
                      <textarea
                        value={o.explanation}
                        onChange={(e) =>
                          update(c.id, { explanation: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Источник HTTPS
                      <input
                        value={o.source}
                        onChange={(e) =>
                          update(c.id, { source: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Дата наблюдения (UTC)
                      <input
                        type="datetime-local"
                        value={o.observedAt.slice(0, 16)}
                        onChange={(e) => {
                          if (e.target.value)
                            update(c.id, {
                              observedAt: new Date(
                                e.target.value + "Z",
                              ).toISOString(),
                            });
                        }}
                      />
                    </label>
                  </>
                )}
              </details>
            );
          })}
          <h3>Риски, подозрительные домены и положительные признаки</h3>
          <p>
            Различайте ссылку официального аккаунта и стороннего ответа. HTTPS и
            возраст домена не доказывают безопасность. Старый аккаунт не
            доказывает скам. Подписки и лайки не равны endorsement.
          </p>
          {draft.flags.map((f, i) => (
            <div className="source-card" key={i}>
              <select
                aria-label="Важность наблюдения"
                value={f.severity}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    flags: draft.flags.map((v, j) =>
                      j === i
                        ? {
                            ...v,
                            severity: e.target.value as typeof f.severity,
                          }
                        : v,
                    ),
                  })
                }
              >
                <option value="warning">Подозрение</option>
                <option value="critical">Сообщение о критической угрозе</option>
                <option value="positive">Положительное наблюдение</option>
              </select>
              {(["text", "source", "observedAt"] as const).map((key) => (
                <label key={key}>
                  {key === "text"
                    ? "Описание, домен, автор и его роль"
                    : key === "source"
                      ? "Источник HTTPS"
                      : "Дата UTC (ISO)"}
                  <input
                    value={f[key]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        flags: draft.flags.map((v, j) =>
                          j === i ? { ...v, [key]: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <button
                onClick={() =>
                  setDraft({
                    ...draft,
                    flags: draft.flags.filter((_, j) => j !== i),
                  })
                }
              >
                Удалить наблюдение
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              setDraft({
                ...draft,
                flags: [
                  ...draft.flags,
                  {
                    severity: "warning",
                    text: "",
                    source: "",
                    observedAt: new Date().toISOString(),
                  },
                ],
              })
            }
          >
            Добавить наблюдение
          </button>
          <details>
            <summary>Импорт / копирование JSON наблюдений</summary>
            <p>
              Вставьте структурированные наблюдения. Mint должен совпадать с
              отчётом; импорт заполняет редактор, сохранение выполняется
              отдельно.
            </p>
            <textarea
              aria-label="JSON наблюдений"
              rows={10}
              value={json}
              onChange={(e) => setJson(e.target.value)}
            />
            <button
              onClick={() => {
                try {
                  if (json.length > 200000)
                    throw new Error("JSON слишком большой");
                  const v = prospectsInputSchema.parse(JSON.parse(json));
                  if (v.mint !== report.mint)
                    throw new Error("Mint не совпадает");
                  setDraft(v);
                  setError("");
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Загрузить в редактор
            </button>
            <button onClick={() => setJson(JSON.stringify(draft, null, 2))}>
              Показать JSON текущих наблюдений
            </button>
          </details>
          {error && (
            <p role="alert" className="red-text">
              {error}
            </p>
          )}
          <button disabled={busy} onClick={() => void save()}>
            {busy ? "Сохранение…" : "Рассчитать и сохранить"}
          </button>
        </div>
      )}
    </section>
  );
}
