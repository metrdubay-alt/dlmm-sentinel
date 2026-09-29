import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { SourceId } from "../../shared/analysis/connections";
const names: Record<SourceId, string> = {
  x: "X",
  grok: "Grok",
  gmgn: "GMGN",
  moni: "Getmoni",
};
export function SourceConnections({ demo }: { demo: boolean }) {
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ["source-connections"],
    queryFn: () => api.sourceConnections(undefined),
    enabled: !demo,
    refetchInterval: 4000,
  });
  const open = useMutation({
    mutationFn: (source: SourceId) => api.sourceLogin(source),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["source-connections"] }),
  });
  return (
    <div
      className="connections-panel"
      role="region"
      aria-label="Входы в источники"
    >
      <div className="connections-title">
        <strong>Входы в источники</strong>
        <span>Сессии DLMM Sentinel · Grok использует вход X</span>
      </div>
      <div className="connections-grid">
        {(["x", "grok", "gmgn", "moni"] as const).map((source) => {
          const c = demo ? undefined : status.data?.[source],
            authed = c?.auth === "signed-in";
          const text = demo
            ? "Демо"
            : authed
              ? "Вход выполнен"
              : c?.auth === "signed-out"
                ? "Нужен вход"
                : "Вход не проверен";
          return (
            <div className="connection-item" key={source} data-source={source}>
              <button
                type="button"
                aria-label={`Аккаунт ${names[source]}`}
                aria-pressed={authed}
                className={
                  authed ? "connection-button source-open" : "connection-button"
                }
                disabled={demo || open.isPending}
                onClick={() => open.mutate(source)}
                title="Открыть окно сервиса для входа или проверки аккаунта"
              >
                <strong>
                  {authed ? "●" : "○"} {names[source]}
                </strong>
                <span>{text}</span>
              </button>
              {source === "moni" &&
                c?.usage &&
                (c.usage.dailyUsedPercent !== null ||
                  c.usage.weeklyUsedPercent !== null) && (
                  <small className="connection-usage">
                    Использовано: день{" "}
                    {c.usage.dailyUsedPercent === null
                      ? "—"
                      : `${c.usage.dailyUsedPercent}%`}{" "}
                    · неделя{" "}
                    {c.usage.weeklyUsedPercent === null
                      ? "—"
                      : `${c.usage.weeklyUsedPercent}%`}
                  </small>
                )}
              {c?.limit && (
                <small role="alert" className="connection-warning">
                  ⚠ {c.limit}
                </small>
              )}
              {c?.challenge && (
                <small role="alert" className="connection-warning">
                  ⚠ Требуется проверка на сайте
                </small>
              )}
            </div>
          );
        })}
      </div>
      <small className="connections-note">
        Пулы · публичные данные Meteora и GeckoTerminal/CoinGecko, отдельный
        вход не требуется. Серый «не проверен» — откройте сервис для проверки.
      </small>
      {(open.error || status.error) && (
        <p role="alert">
          {open.error?.message ?? "Не удалось проверить входы"}
        </p>
      )}
    </div>
  );
}
