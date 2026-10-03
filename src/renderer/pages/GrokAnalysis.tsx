import {
  isTransferFeeFlag,
  withoutTransferFeeRate,
} from "../../shared/analysis/grok-social-display";
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
  const redFlags =
    answer?.redFlags.filter((f) => !isTransferFeeFlag(f.text)) ?? [];
  const greenFlags =
    answer?.greenFlags.filter((f) => !isTransferFeeFlag(f.text)) ?? [];
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
          {withoutTransferFeeRate(answer.description)
            .split(/\n\s*\n/)
            .map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          {answer.narrativeDetails && (
            <div aria-label="Разбор нарратива">
              <h3>Суть нарратива</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {withoutTransferFeeRate(answer.narrativeDetails.essence)}
              </p>
              <h3>Кто подхватил</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {withoutTransferFeeRate(answer.narrativeDetails.adoption)}
              </p>
              <h3>Актуальность</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {withoutTransferFeeRate(answer.narrativeDetails.momentum)}
              </p>
            </div>
          )}
          {answer.recentActivity && (
            <div aria-label="Важная активность за последние 10 минут">
              <h3>Важная активность за последние 10 минут</h3>
              <p className="muted">
                {dateText(answer.recentActivity.windowStart)} —{" "}
                {dateText(answer.recentActivity.windowEnd)}
              </p>
              <p>{answer.recentActivity.summary}</p>
              {answer.recentActivity.events.map((event, index) => (
                <div key={index} className="grok-recent-event">
                  <p>
                    <strong>{dateText(event.at)}</strong> · {event.text}
                  </p>
                  <p>{event.significance}</p>
                  <div className="button-row">{event.sources.map(link)}</div>
                </div>
              ))}
            </div>
          )}
          {answer.feeRecipientSupport && (
            <div aria-label="Участие получателя комиссий">
              <h3>Участие получателя комиссий</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {withoutTransferFeeRate(answer.feeRecipientSupport.summary)}
              </p>
              <div className="button-row">
                {answer.feeRecipientSupport.sources.map(link)}
              </div>
            </div>
          )}
          <p>{withoutTransferFeeRate(answer.scoreReason)}</p>
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

          {!!redFlags.length && (
            <>
              <h3
                style={{
                  color: "#ff707b",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <svg
                  width="16"
                  height="28"
                  viewBox="0 0 16 28"
                  aria-hidden="true"
                >
                  <rect
                    x="2"
                    y="1"
                    width="12"
                    height="24"
                    rx="4"
                    fill="#271a20"
                    stroke="#ff707b"
                  />
                  <circle cx="8" cy="6" r="3" fill="#ff707b" />
                  <circle cx="8" cy="13" r="2.5" fill="#374151" />
                  <circle cx="8" cy="20" r="2.5" fill="#374151" />
                  <path d="M8 25v3" stroke="#ff707b" strokeWidth="2" />
                </svg>
                Red flags
              </h3>
              {redFlags.map((f, i) => (
                <div key={i}>
                  <p>{f.text}</p>
                  <div className="button-row">{f.sources.map(link)}</div>
                </div>
              ))}
            </>
          )}
          {!!greenFlags.length && (
            <>
              <h3
                style={{
                  color: "#4ade80",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <svg
                  width="16"
                  height="28"
                  viewBox="0 0 16 28"
                  aria-hidden="true"
                >
                  <rect
                    x="2"
                    y="1"
                    width="12"
                    height="24"
                    rx="4"
                    fill="#15251f"
                    stroke="#4ade80"
                  />
                  <circle cx="8" cy="6" r="2.5" fill="#374151" />
                  <circle cx="8" cy="13" r="2.5" fill="#374151" />
                  <circle cx="8" cy="20" r="3" fill="#4ade80" />
                  <path d="M8 25v3" stroke="#4ade80" strokeWidth="2" />
                </svg>
                Green flags
              </h3>
              {greenFlags.map((f, i) => (
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
