import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, dateText } from "../lib/api";
import {
  tokenKey,
  type WorkspaceReport,
} from "../../shared/analysis/workspace";
const phaseText = {
  idle: "",
  opening: "Открываю Grok…",
  sending: "Отправляю запрос…",
  waiting: "Grok изучает Twitter и готовит ответ…",
  complete: "Ответ сохранён",
  error: "Анализ остановлен",
};
export function GrokAnalysis({
  report: r,
  pipelineBusy,
}: {
  report: WorkspaceReport;
  pipelineBusy?: boolean;
}) {
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings(undefined),
  });
  const status = useQuery({
    queryKey: ["grok-status"],
    queryFn: () => api.grokStatus(undefined),
    refetchInterval: 1500,
  });
  const run = useMutation({
    mutationFn: () => api.grokRun(r.config.target),
    onSuccess: async (report) => {
      client.setQueryData(["workspace-report", report.config.target], report);
      await client.invalidateQueries({ queryKey: ["workspace-list"] });
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["grok-status"] }),
  });
  const cancel = useMutation({
    mutationFn: () => api.grokCancel(undefined),
    onSettled: () => client.invalidateQueries({ queryKey: ["grok-status"] }),
  });
  const job = status.data,
    busy = !!job && ["opening", "sending", "waiting"].includes(job.phase),
    same = job?.target && tokenKey(job.target) === tokenKey(r.config.target);
  const result =
      r.grok &&
      (r.grok.handle === r.config.handle ||
        (!r.grok.handle &&
          r.grok.answer.discoveredProfile?.handle === r.config.handle))
        ? r.grok
        : null,
    answer = result?.answer;
  const link = (url: string, i: number) => (
    <button
      className="text-button"
      key={url + i}
      onClick={() => void api.openExternal(url)}
    >
      Источник {i + 1}
    </button>
  );
  return (
    <div className="grok-analysis">
      <div className="button-row">
        <button
          className="primary"
          disabled={
            settings.data?.demoMode !== false ||
            pipelineBusy ||
            busy ||
            run.isPending
          }
          onClick={() => run.mutate()}
        >
          {busy && same
            ? "Grok анализирует…"
            : result
              ? "Обновить анализ Grok"
              : "Анализировать Twitter"}
        </button>
        {busy && (
          <button disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            Остановить Grok
          </button>
        )}
      </div>
      {busy && (
        <p role="status">
          {same
            ? phaseText[job.phase]
            : "Grok анализирует другой токен. Дождитесь завершения."}
        </p>
      )}
      {(run.error || (same && job?.phase === "error" && job.error)) && (
        <p role="alert" className="error">
          {run.error?.message || job?.error}
        </p>
      )}
      {cancel.error && <p role="alert">{cancel.error.message}</p>}
      {!answer && (
        <p>
          Одна кнопка отправляет запрос в Grok и сохраняет ответ в карточке.
          Используется ваш вход в X.
        </p>
      )}
      {answer && result && (
        <>
          {result.answer.discoveredProfile && (
            <p>
              Профиль найден Grok: @{result.answer.discoveredProfile.handle}{" "}
              {result.answer.discoveredProfile.sources.map(link)}
            </p>
          )}
          <h3>
            {answer.score === null
              ? "Grok: недостаточно данных для балла"
              : `${answer.score} / 100 · Grok`}
          </h3>
          {answer.description.split(/\n\s*\n/).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          {answer.narrativeDetails && (
            <div aria-label="Разбор нарратива">
              <h3>Суть нарратива</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {answer.narrativeDetails.essence}
              </p>
              <h3>Кто подхватил</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {answer.narrativeDetails.adoption}
              </p>
              <h3>Актуальность</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {answer.narrativeDetails.momentum}
              </p>
            </div>
          )}
          <p>{answer.scoreReason}</p>
          <p>
            Нарратив:{" "}
            <b>
              {
                {
                  growing: "растёт",
                  stable: "стабилен",
                  fading: "угасает",
                  unknown: "динамика не определена",
                }[answer.narrative]
              }
            </b>{" "}
            · {dateText(result.observedAt)} ·{" "}
            <button
              className="text-button"
              onClick={() => void api.openExternal(result.sourceUrl)}
            >
              Ответ в Grok
            </button>
          </p>

          {!!answer.redFlags.length && (
            <>
              <h3>Red flags</h3>
              {answer.redFlags.map((f, i) => (
                <div key={i}>
                  <p className="amber-text">{f.text}</p>
                  <div className="button-row">{f.sources.map(link)}</div>
                </div>
              ))}
            </>
          )}
          {!!answer.greenFlags.length && (
            <>
              <h3>Green flags</h3>
              {answer.greenFlags.map((f, i) => (
                <div key={i}>
                  <p>{f.text}</p>
                  <div className="button-row">{f.sources.map(link)}</div>
                </div>
              ))}
            </>
          )}
          {!!answer.accounts.length && (
            <details>
              <summary>Значимые аккаунты · {answer.accounts.length}</summary>
              <table>
                <thead>
                  <tr>
                    <th>Аккаунт</th>
                    <th>Роль</th>
                    <th>Активность</th>
                  </tr>
                </thead>
                <tbody>
                  {answer.accounts.map((a, i) => (
                    <tr key={i}>
                      <td>{a.handle}</td>
                      <td>{a.role}</td>
                      <td>
                        {a.activity} {link(a.source, i)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          {!!answer.unknowns.length && (
            <details>
              <summary>Пробелы исследования</summary>
              {answer.unknowns.map((t, i) => (
                <p key={i}>{t}</p>
              ))}
            </details>
          )}
          <details>
            <summary>Источники и полный ответ</summary>
            <div className="button-row">{answer.sources.map(link)}</div>
            <pre>{result.rawText}</pre>
          </details>
        </>
      )}
    </div>
  );
}
