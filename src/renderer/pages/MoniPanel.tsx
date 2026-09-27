import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compareMoni, moniHandleSchema } from "../../shared/analysis/moni";
import { api, dateText } from "../lib/api";

export function MoniPanel({ demo }: { demo: boolean }) {
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState("");
  const [notice, setNotice] = useState("");
  const client = useQueryClient();
  const history = useQuery({
    queryKey: ["moni", selected],
    queryFn: () => api.moniHistory(selected),
    enabled: !!selected,
  });
  const action = useMutation({
    mutationFn: async ({
      kind,
      handle,
    }: {
      kind: "open" | "capture";
      handle: string;
    }) => {
      if (kind === "open") {
        await api.moniOpen(handle);
        return null;
      }
      return api.moniCapture(handle);
    },
    onSuccess: (rows, { handle }) => {
      if (rows) {
        client.setQueryData(["moni", handle], rows);
        setNotice(
          "Снимок сохранён. Время ниже — время чтения страницы; задержка обновления Moni неизвестна.",
        );
      } else
        setNotice(
          "Войдите в открытое окно Moni, дождитесь карточки и нажмите «Считать показатели». Вход в браузере Codex сюда не переносится.",
        );
    },
    onError: (e) => setNotice(e.message),
  });
  function run(kind: "open" | "capture" | "history") {
    const parsed = moniHandleSchema.safeParse(input);
    if (!parsed.success) {
      setNotice("Введите имя аккаунта X без ссылки, например ArtificiallyInu.");
      return;
    }
    setSelected(parsed.data);
    setNotice("");
    if (kind !== "history") action.mutate({ kind, handle: parsed.data });
    else void client.invalidateQueries({ queryKey: ["moni", parsed.data] });
  }
  const rows = history.data ?? [];
  const latest = rows.at(-1);
  const comparison = latest ? compareMoni(latest, rows.at(-2)) : null;
  return (
    <section className="panel">
      <h2>GetMoni · социальное внимание</h2>
      <p>
        Автоматическое чтение открытой карточки без API-ключа. Укажите аккаунт X
        проекта. История хранится отдельно по аккаунтам; принадлежность токену и
        сеть требуют проверки.
      </p>
      <label>
        Аккаунт X для GetMoni
        <input
          aria-label="Аккаунт X для GetMoni"
          placeholder="ArtificiallyInu"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={action.isPending}
          maxLength={32}
        />
      </label>
      <div className="button-row">
        <button disabled={demo || action.isPending} onClick={() => run("open")}>
          Открыть GetMoni
        </button>
        <button
          disabled={demo || action.isPending}
          onClick={() => run("capture")}
        >
          Считать показатели
        </button>
        <button disabled={action.isPending} onClick={() => run("history")}>
          Показать историю
        </button>
      </div>
      {demo && (
        <p>
          В демо-режиме обращения к GetMoni отключены. Для чтения сайта
          сохраните режим «Реальные источники».
        </p>
      )}
      {action.isPending && <p role="status">Обработка…</p>}
      {notice && (
        <p role="status" className="info-note">
          {notice}
        </p>
      )}
      {history.error && (
        <p role="alert" className="error">
          {history.error.message}
        </p>
      )}
      {selected && !history.isPending && !latest && (
        <p>Для @{selected} пока нет сохранённых снимков.</p>
      )}
      {latest && (
        <>
          <h3>@{latest.handle} · РЕАЛЬНЫЙ СНИМОК GETMONI</h3>
          <p>
            Прочитан {dateText(latest.observedAt)}. Сохранённый снимок не
            обновляется автоматически.
          </p>
          <div className="stat-grid">
            <div className="stat">
              <span>Moni Score · шкала сервиса</span>
              <strong>{latest.score}</strong>
            </div>
            <div className="stat">
              <span>Значимые подписчики по Moni</span>
              <strong>{latest.smarts ?? "Нет данных"}</strong>
            </div>
            <div className="stat">
              <span>Изменение с предыдущей проверки</span>
              <strong>
                {comparison?.scoreDelta == null
                  ? "Нет сравнения"
                  : `${comparison.scoreDelta > 0 ? "+" : ""}${comparison.scoreDelta}`}
              </strong>
            </div>
          </div>
          {comparison?.needsReview && (
            <p className="info-note">
              Moni Score снизился. Проверьте активность и состав подписчиков:
              снижение само по себе не доказывает отписку или близкий dump.
            </p>
          )}
          <p>
            Доступные аккаунты ({latest.visibleSmarts.length}):{" "}
            {latest.visibleSmarts.map((h) => `@${h}`).join(", ") ||
              "список не прочитан"}
            .
          </p>
          <p>
            Список неполный. Исчезновение из него не доказывает отписку.
            Подписка не означает поддержку, инвестицию или партнёрство. Moni
            Score не является нашей оценкой из 100.
          </p>
          <button
            onClick={() =>
              void api
                .openExternal(latest.sourceUrl)
                .catch((e) => setNotice(String(e)))
            }
          >
            Открыть источник в браузере
          </button>
          <details>
            <summary>
              История · последние {rows.length} снимков (до 100)
            </summary>
            <table>
              <thead>
                <tr>
                  <th>Время чтения</th>
                  <th>Moni Score</th>
                  <th>Smarts</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((row) => (
                  <tr key={row.observedAt}>
                    <td>{dateText(row.observedAt)}</td>
                    <td>{row.score}</td>
                    <td>{row.smarts ?? "Нет данных"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
