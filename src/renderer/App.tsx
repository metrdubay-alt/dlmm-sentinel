import { ProfilesPage } from "./pages/ProfilesPage";
import { SourceConnections } from "./pages/SourceConnections";
import { WorkspacePage } from "./pages/WorkspacePage";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  Crosshair,
  FlaskConical,
  Archive,
  SlidersHorizontal,
} from "lucide-react";
import { api, dateText } from "./lib/api";
import { useUi } from "./stores/ui";
import { ReportPage } from "./pages/ReportPage";
import { verdictLabels } from "../shared/schemas/domain";
import { scenarioLabels } from "../shared/providers/mock/fixtures";
import icon from "../../assets/icon-source.svg";
export function App() {
  const { page, setPage, setReport, setWorkspace } = useUi();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings(undefined),
  });
  const demo = settings.data?.demoMode ?? true;
  const client = useQueryClient();
  const mode = useMutation({
    mutationFn: (demoMode: boolean) =>
      api.saveSettings({ ...settings.data!, demoMode }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["settings"] });
      await client.invalidateQueries({ queryKey: ["workspace-sources"] });
    },
  });
  const reports = useQuery({
    queryKey: ["reports"],
    queryFn: () => api.reports(undefined),
  });
  const cards = useQuery({
    queryKey: ["workspace-list"],
    queryFn: () => api.workspaceList(undefined),
    enabled: page === "dashboard",
  });
  const removeCard = useMutation({
    mutationFn: api.workspaceDelete,
    onSuccess: async (deleted, target) => {
      if (!deleted) return;
      const current = useUi.getState().workspaceConfig?.target;
      if (current?.chain === target.chain && current.address === target.address)
        useUi.setState({ workspaceConfig: null });
      await client.invalidateQueries({ queryKey: ["workspace-list"] });
      client.removeQueries({
        queryKey: ["workspace-report", target],
      });
    },
  });
  const nav = [
    ["workspace", Activity, "Карточка токена"],
    ["dashboard", Archive, "Архив"],
    ["profiles", SlidersHorizontal, "Профили"],
  ] as const;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={icon} alt="" />
          <div>
            DLMM <strong>Sentinel</strong>
            <small>КОНТРОЛЬ РИСКОВ</small>
          </div>
        </div>
        <div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav>
          {nav.map(([id, Icon, label]) => (
            <button
              key={id}
              className={page === id ? "nav-item selected" : "nav-item"}
              onClick={() => setPage(id)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span className="dot" /> Локальный режим
          </div>
          <p>Данные хранятся на этом устройстве</p>
          <div className="version">
            v0.3.43 <span>Источники</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            Рабочее пространство <ChevronRight size={14} />{" "}
            {nav.find((n) => n[0] === page)?.[2]}
          </span>
          <div>
            <label className="data-mode-control">
              <FlaskConical size={13} />
              <select
                aria-label="Режим данных"
                disabled={!settings.data || mode.isPending}
                value={demo ? "mock" : "live"}
                onChange={(e) => mode.mutate(e.target.value === "mock")}
              >
                <option value="mock">ДЕМО-ДАННЫЕ</option>
                <option value="live">Реальные источники</option>
              </select>
            </label>
          </div>
        </header>
        <main>
          <SourceConnections demo={demo} />
          {mode.error && <p role="alert">{mode.error.message}</p>}
          {demo && (
            <div className="demo-notice">
              ДЕМО-ДАННЫЕ · Запросы к источникам отключены.
            </div>
          )}
          {page === "dashboard" && (
            <>
              <div className="page-title">
                <div>
                  <span className="eyebrow">СОХРАНЁННЫЕ ИССЛЕДОВАНИЯ</span>
                  <h1>Архив</h1>
                  <p>Сохранённые карточки токенов и последние 50 отчётов.</p>
                </div>
                <button className="primary" onClick={() => setWorkspace(null)}>
                  <Crosshair size={17} /> Новый токен
                </button>
              </div>
              <section className="panel">
                <h2>Карточки токенов</h2>
                <p>Открывается карточка с последними сохранёнными данными.</p>
                {cards.error && <p role="alert">{cards.error.message}</p>}
                {removeCard.error && (
                  <p role="alert">{removeCard.error.message}</p>
                )}
                {!cards.data?.some(
                  (c) => c.lastAttempt || c.research.length || c.grok,
                ) ? (
                  <p>Пока нет сохранённых карточек.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Токен / адрес</th>
                        <th>Сеть</th>
                        <th>Последняя проверка</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {cards.data
                        ?.filter(
                          (c) => c.lastAttempt || c.research.length || c.grok,
                        )
                        .map((c) => (
                          <tr
                            key={`${c.config.target.chain}:${c.config.target.address}`}
                          >
                            <td>
                              <strong className="archive-token-name">
                                {c.config.label || "Название не указано"}
                              </strong>
                              <code title={c.config.target.address}>
                                {c.config.target.address.slice(0, 10)}…
                                {c.config.target.address.slice(-7)}
                              </code>
                            </td>
                            <td>{c.config.target.chain.toUpperCase()}</td>
                            <td>
                              {c.lastAttempt
                                ? dateText(c.lastAttempt)
                                : "Ещё не проверена"}
                            </td>
                            <td>
                              <button onClick={() => setWorkspace(c.config)}>
                                Открыть карточку
                              </button>
                              <button
                                disabled={removeCard.isPending}
                                aria-label={`Удалить карточку ${c.config.label || c.config.target.address}`}
                                onClick={() =>
                                  removeCard.mutate(c.config.target)
                                }
                              >
                                Удалить
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h2>Исследования</h2>
                  <span className="muted">
                    Сохранённые снимки · режим указан у каждого
                  </span>
                </div>
                {reports.error && (
                  <p role="alert" className="error">
                    {reports.error.message}
                  </p>
                )}
                {!reports.data?.length ? (
                  <div className="empty">
                    <Activity size={30} />
                    <h3>Здесь появятся ваши отчёты</h3>
                    <p>
                      Сохранённые отчёты предыдущих исследований появятся здесь.
                    </p>
                    <button onClick={() => setWorkspace(null)}>
                      Создать карточку
                    </button>
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Токен / адрес / время</th>
                        <th>Риск</th>
                        <th>Достоверность</th>
                        <th>Решение</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {reports.data.map((r) => {
                        const identity = r.snapshots.find(
                          (s) =>
                            s.details?.identity?.mint === r.mint &&
                            (s.details.identity.name?.trim() ||
                              s.details.identity.symbol?.trim()),
                        )?.details?.identity;
                        const label = cards.data
                          ?.find(
                            (c) =>
                              c.config.target.chain === "sol" &&
                              c.config.target.address === r.mint,
                          )
                          ?.config.label.trim();
                        const name =
                          r.sourceType === "mock"
                            ? `Демо: ${scenarioLabels[r.scenario]}`
                            : identity?.name?.trim() ||
                              label ||
                              identity?.symbol?.trim() ||
                              "Название не получено";
                        return (
                          <tr key={r.id}>
                            <td>
                              <strong className="archive-token-name">
                                {name}
                                {r.sourceType !== "mock" &&
                                identity?.symbol?.trim() &&
                                identity.symbol.trim() !== name
                                  ? ` (${identity.symbol.trim()})`
                                  : ""}
                              </strong>
                              <code title={r.mint}>
                                {r.mint.slice(0, 10)}…{r.mint.slice(-7)}
                              </code>
                              <small>{dateText(r.generatedAt)}</small>
                              <small>
                                {r.sourceType === "mock"
                                  ? "ДЕМО-ДАННЫЕ"
                                  : "РЕАЛЬНЫЕ ИСТОЧНИКИ"}
                              </small>
                            </td>
                            <td>
                              {r.sourceType === "live"
                                ? "N/A · неполный анализ"
                                : `${r.score.total}/100`}
                            </td>
                            <td>{r.confidence.total}/100</td>
                            <td>
                              <span className="pill amber">
                                {verdictLabels[r.suitability.verdict]}
                              </span>
                            </td>
                            <td>
                              <button
                                aria-label="Открыть отчёт"
                                onClick={() => setReport(r)}
                              >
                                <ArrowUpRight size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          )}
          {page === "workspace" && <WorkspacePage />}
          {page === "profiles" && <ProfilesPage />}
          {page === "report" && (
            <>
              <button onClick={() => setPage("dashboard")}>← В архив</button>
              <ReportPage />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
