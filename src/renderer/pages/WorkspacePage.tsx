import { Eye } from "lucide-react";
import { MinuteVolumes } from "./MinuteVolumes";
import {
  defaultNumericProfiles,
  profileTone,
  formatTokenAge,
} from "../../shared/analysis/numeric-profiles";
import { TransferFeeWarning } from "./TransferFeeWarning";
import {
  runTokenAnalysis,
  type AnalysisStage,
  type StageState,
} from "../lib/run-token-analysis";
import { metricTone, metricToneStyle } from "../lib/metric-tone";
import { relatedRoleLabels } from "../../shared/analysis/related-account";
import { buildGrokPrompt } from "../../shared/analysis/grok";
import { GrokAnalysis } from "./GrokAnalysis";
import { useUi } from "../stores/ui";
import { Fragment, useState, useRef, type ReactNode } from "react";
import { SniperIcon } from "./SniperIcon";
import { FeesIcon } from "./FeesIcon";
import { MetricIllustration } from "./MetricIllustration";
import { PoolPanel } from "./PoolPanel";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, dateText } from "../lib/api";
import {
  workspaceConfigSchema,
  tokenKey,
  type WorkspaceConfig,
  type WorkspaceReport,
} from "../../shared/analysis/workspace";
import { gmgnStrategyInput } from "../../shared/analysis/gmgn";
import { numericScore } from "../../shared/analysis/numeric-score";
import { summarizeSocial } from "../../shared/analysis/social-summary";
import {
  assessProspects,
  prospectsInputSchema,
} from "../../shared/analysis/prospects";
import { metricLabels } from "./NumericPage";
import { feeDisplay } from "../lib/fee-display";
const empty: WorkspaceConfig = {
  target: { chain: "sol", address: "" },
  label: "",
  handle: null,
  monitor: false,
  intervalMinutes: 15,
};
function grokPrompt(config: WorkspaceConfig) {
  return buildGrokPrompt({
    target: config.target,
    handle: config.handle,
    requestId: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
  });
}

export function WorkspacePage() {
  const initialConfig = useUi((s) => s.workspaceConfig);
  const [draft, setDraft] = useState<WorkspaceConfig>(initialConfig ?? empty),
    [selected, setSelected] = useState<WorkspaceConfig["target"] | null>(
      initialConfig?.target ?? null,
    ),
    [editing, setEditing] = useState(!initialConfig),
    [message, setMessage] = useState(""),
    [json, setJson] = useState(""),
    [grokNotice, setGrokNotice] = useState("");
  const query = useQueryClient();
  const settings = useQuery({
      queryKey: ["settings"],
      queryFn: () => api.settings(undefined),
    }),
    demo = settings.data?.demoMode ?? true;
  const report = useQuery({
    queryKey: ["workspace-report", selected],
    queryFn: () => api.workspaceReport(selected!),
    enabled: !!selected,
    refetchInterval: 10000,
  });
  const connections = useQuery({
    queryKey: ["source-connections"],
    queryFn: () => api.sourceConnections(undefined),
    enabled: !demo,
    refetchInterval: 4000,
  });
  const sources = useQuery({
    queryKey: ["workspace-sources", selected],
    queryFn: () => api.workspaceSources(selected!),
    enabled: !!selected,
    refetchInterval: 2000,
  });
  const task = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: async () => {
      await query.invalidateQueries({ queryKey: ["workspace-list"] });
      await query.invalidateQueries({ queryKey: ["workspace-report"] });
      await query.invalidateQueries({ queryKey: ["workspace-sources"] });
      setMessage("Готово.");
    },
    onError: (e) => setMessage(e.message),
  });
  const run = (fn: () => Promise<unknown>) => {
    setMessage("");
    task.mutate(fn);
  };
  const r = report.data;
  const [stages, setStages] = useState<
    Partial<Record<AnalysisStage, StageState>>
  >({});
  const stageRef = useRef<Partial<Record<AnalysisStage, StageState>>>({});
  const launchLock = useRef(false);
  const analysis = useMutation({
    mutationFn: (config: WorkspaceConfig) =>
      runTokenAnalysis(config, api, {
        report: (result) => {
          query.setQueryData(
            ["workspace-report", result.config.target],
            result,
          );
          setSelected(result.config.target);
          setEditing(false);
        },
        stage: (name, value) => {
          stageRef.current = { ...stageRef.current, [name]: value };
          setStages(stageRef.current);
        },
        pools: (result) =>
          query.setQueryData(["pool-snapshot", result.target], result),
      }),
    onSuccess: () =>
      setMessage(
        Object.values(stageRef.current).some((x) => x.state !== "done")
          ? "Анализ завершён частично — причины указаны по этапам. Полученные результаты сохранены."
          : "Анализ завершён. Результаты сохранены в карточке и архиве.",
      ),
    onError: (e) => setMessage(e.message),
    onSettled: async () => {
      launchLock.current = false;
      await Promise.all([
        query.invalidateQueries({ queryKey: ["workspace-list"] }),
        query.invalidateQueries({ queryKey: ["workspace-report"] }),
        query.invalidateQueries({ queryKey: ["workspace-sources"] }),
      ]);
    },
  });
  const numericRefresh = useMutation({
    mutationFn: (target: WorkspaceConfig["target"]) =>
      api.workspaceRefresh({ target, navigate: true, scope: "numeric" }),
    onSuccess: async (updated) => {
      query.setQueryData(["workspace-report", updated.config.target], updated);
      await query.invalidateQueries({ queryKey: ["workspace-list"] });
      await query.invalidateQueries({ queryKey: ["source-connections"] });
    },
  });
  const busy = task.isPending || analysis.isPending || numericRefresh.isPending;
  function startAnalysis(config: WorkspaceConfig) {
    if (launchLock.current || busy) return;
    const parsed = workspaceConfigSchema.safeParse(config);
    if (!parsed.success) {
      setMessage(
        parsed.error.issues[0]?.message || "Проверьте адрес и сеть токена",
      );
      return;
    }
    launchLock.current = true;
    setMessage("Создаю карточку и запускаю анализ…");
    stageRef.current = Object.fromEntries(
      ["gmgn", "grok", "social", "pools"].map((k) => [
        k,
        { state: "waiting", detail: "Ожидание" },
      ]),
    ) as Partial<Record<AnalysisStage, StageState>>;
    setStages(stageRef.current);
    analysis.mutate(parsed.data);
  }

  function save() {
    run(async () => {
      const input = workspaceConfigSchema.parse(draft);
      const saved = await api.workspaceSave(input);
      setSelected(saved.config.target);
      setEditing(false);
      return saved;
    });
  }
  return (
    <>
      <section className="panel token-header">
        <div className="token-header-row">
          <div>
            <span className="eyebrow">КАРТОЧКА ТОКЕНА</span>
            <h1>
              {r ? r.config.label || "Токен" : "Новый токен"}
              {r && (
                <span className="token-network">
                  {r.config.target.chain.toUpperCase()}
                </span>
              )}
            </h1>
            {r && (
              <code className="token-address">{r.config.target.address}</code>
            )}
          </div>
          <div className="button-row">
            {r && !editing && (
              <button
                className="primary"
                disabled={demo || busy}
                onClick={() => startAnalysis(r.config)}
              >
                {analysis.isPending
                  ? "Анализ выполняется…"
                  : "Запустить анализ"}
              </button>
            )}
            {r && (
              <button
                disabled={busy}
                onClick={() => {
                  setDraft(r.config);
                  setEditing(!editing);
                }}
              >
                Изменить
              </button>
            )}
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                setSelected(null);
                setDraft(empty);
                setEditing(true);
                setJson("");
                setMessage("");
                setGrokNotice("");
                setStages({});
              }}
            >
              Новый токен
            </button>
          </div>
        </div>
        {editing && (
          <form
            className="token-edit-grid"
            onSubmit={(e) => {
              e.preventDefault();
              if (selected || demo) save();
              else startAnalysis(draft);
            }}
          >
            <label>
              Сеть карточки
              <select
                aria-label="Сеть карточки"
                value={draft.target.chain}
                disabled={busy}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    target: {
                      chain: e.target
                        .value as WorkspaceConfig["target"]["chain"],
                      address: "",
                    },
                  })
                }
              >
                <option value="sol">Solana</option>
                <option value="bsc">BSC</option>
                <option value="eth">Ethereum (ETH)</option>
                <option value="base">Base</option>
                <option value="robinhood">Robinhood Chain</option>
              </select>
            </label>
            <label>
              Адрес карточки
              <input
                aria-label="Адрес карточки"
                value={draft.target.address}
                disabled={busy}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    target: { ...draft.target, address: e.target.value.trim() },
                  })
                }
              />
            </label>
            {selected ? (
              <>
                <label>
                  Тикер
                  <input
                    aria-label="Тикер карточки"
                    value={draft.label}
                    onChange={(e) =>
                      setDraft({ ...draft, label: e.target.value })
                    }
                  />
                </label>
                <label>
                  Профиль X — кандидат, не подтверждение официальности
                  <input
                    aria-label="Профиль X карточки"
                    placeholder="Необязательно — Grok найдёт по адресу"
                    value={draft.handle ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, handle: e.target.value || null })
                    }
                  />
                </label>
              </>
            ) : (
              <p className="muted">
                Тикер и профиль X определятся при анализе токена.
              </p>
            )}

            <label className="token-option">
              <input
                type="checkbox"
                checked={draft.moniEnabled !== false}
                onChange={(e) =>
                  setDraft({ ...draft, moniEnabled: e.target.checked })
                }
              />{" "}
              Использовать GetMoni при обновлении
            </label>
            <button className="primary" disabled={busy} type="submit">
              {selected || demo ? "Сохранить карточку" : "Запустить анализ"}
            </button>
          </form>
        )}
        {message && <p role="status">{message}</p>}
        {task.isPending && <p role="status">Выполняется проверка…</p>}
        {Object.keys(stages).length > 0 && (
          <div aria-label="Этапы анализа" aria-live="polite">
            {Object.entries(stages).map(([name, value]) => (
              <p
                key={name}
                className={
                  value.state === "error" || value.state === "partial"
                    ? "amber-text"
                    : ""
                }
              >
                <strong>
                  {
                    {
                      gmgn: "Числовые данные GMGN",
                      grok: "Twitter · Grok",
                      social: "X и Getmoni",
                      pools: "Объёмы и пулы",
                    }[name as AnalysisStage]
                  }
                </strong>
                : {value.detail}
              </p>
            ))}
          </div>
        )}
        {report.error && <p role="alert">{report.error.message}</p>}
      </section>
      {r && (
        <>
          <div className="token-sources">
            {grokNotice && <p role="status">{grokNotice}</p>}
            <div className="button-row">
              {(["gmgn", "x", "moni", "grok"] as const).map((source) => (
                <button
                  key={source}
                  aria-pressed={
                    !demo && connections.data?.[source].auth === "signed-in"
                  }
                  className={
                    !demo && connections.data?.[source].auth === "signed-in"
                      ? "source-open"
                      : ""
                  }
                  title={
                    sources.data?.[source]
                      ? "Окно источника открыто. Авторизация проверяется самим сервисом."
                      : "Открыть источник в приложении"
                  }
                  disabled={
                    demo ||
                    busy ||
                    ((source === "x" || source === "moni") && !r.config.handle)
                  }
                  onClick={() =>
                    run(async () => {
                      if (source === "grok") {
                        try {
                          await navigator.clipboard.writeText(
                            grokPrompt(r.config),
                          );
                          setGrokNotice(
                            "Запрос для этого токена скопирован. В Grok нажмите Ctrl+V и отправьте его.",
                          );
                        } catch {
                          setGrokNotice(
                            "Откройте «Запрос для Grok» в социальной оценке и скопируйте текст вручную.",
                          );
                        }
                      }
                      return api.workspaceOpen({
                        target: r.config.target,
                        source,
                      });
                    })
                  }
                >
                  {sources.data?.[source] ? "● Открыто: " : "Открыть "}
                  {source === "gmgn"
                    ? "GMGN"
                    : source === "x"
                      ? "X"
                      : source === "grok"
                        ? "Grok"
                        : "Moni"}
                </button>
              ))}
              <button
                disabled={demo || busy}
                onClick={() =>
                  run(() =>
                    api.workspaceRefresh({
                      target: r.config.target,
                      navigate: false,
                    }),
                  )
                }
              >
                Прочитать открытые источники
              </button>
              <button
                disabled={demo || busy}
                onClick={() =>
                  run(() =>
                    (async () => {
                      await api.workspaceRefresh({
                        target: r.config.target,
                        navigate: true,
                      });
                      const pools = await api.poolsRefresh(r.config.target);
                      query.setQueryData(
                        ["pool-snapshot", r.config.target],
                        pools,
                      );
                    })(),
                  )
                }
              >
                Обновить всё
              </button>
            </div>
            <small>
              Обновление:{" "}
              {r.lastAttempt ? dateText(r.lastAttempt) : "ещё не выполнялось"}
              {r.config.moniEnabled === false ? " · GetMoni отключён" : ""}
            </small>
            {Object.entries(r.errors)
              .filter(
                ([source]) =>
                  source !== "moni" || r.config.moniEnabled !== false,
              )
              .map(([source, error]) => (
                <p className="error" key={source}>
                  {source}: {error}
                </p>
              ))}
          </div>
          <NumericSummary
            report={r}
            disabled={demo || busy}
            refreshing={numericRefresh.isPending}
            error={numericRefresh.error?.message}
            onRefresh={() => numericRefresh.mutate(r.config.target)}
          />
          <SocialSummary report={r} pipelineBusy={analysis.isPending}>
            <details>
              <summary>Импорт структурированного исследования</summary>
              <textarea
                aria-label="JSON исследования карточки"
                rows={8}
                value={json}
                onChange={(e) => setJson(e.target.value)}
                placeholder={
                  '{"mint":"адрес", "description":"...", "projectType":"meme", "observations":[], "flags":[]}'
                }
              />
              <button
                disabled={task.isPending || !json.trim()}
                onClick={() =>
                  run(() =>
                    api.workspaceResearch({
                      target: r.config.target,
                      handle: r.config.handle,
                      input: prospectsInputSchema.parse(JSON.parse(json)),
                      origin: "user",
                    }),
                  )
                }
              >
                Сохранить исследование
              </button>
            </details>
          </SocialSummary>
          <PoolPanel
            pipelineBusy={analysis.isPending}
            key={tokenKey(r.config.target)}
            target={r.config.target}
            demo={demo}
          />
        </>
      )}
    </>
  );
}
function RedFlag({ hint }: { hint: string }) {
  return (
    <span
      className="red-flag"
      role="img"
      aria-label={`Красный флаг: ${hint}`}
      title={hint}
    >
      🚩
    </span>
  );
}
function NumericSummary({
  report: r,
  disabled,
  refreshing,
  error,
  onRefresh,
}: {
  report: WorkspaceReport;
  disabled: boolean;
  refreshing: boolean;
  error?: string;
  onRefresh: () => void;
}) {
  const s = r.gmgn,
    input = s ? gmgnStrategyInput(s) : null,
    n = input ? numericScore(input) : null;
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings(undefined),
  });
  const profiles = settings.data?.numericProfiles ?? defaultNumericProfiles();
  const selectedProfile = profiles.find(
    (p) => p.id === r.config.numericProfileId,
  );
  const autoProfile = profiles.find(
    (p) => p.id === n?.assessment.classification.mode,
  );
  const profile = selectedProfile ?? autoProfile;
  const changeProfile = useMutation({
    mutationFn: async (id: string) => {
      const current = await api.workspaceReport(r.config.target);
      const config = { ...current.config };
      if (id === "auto") delete config.numericProfileId;
      else config.numericProfileId = id;
      return api.workspaceSave(config);
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(
        ["workspace-report", updated.config.target],
        updated,
      );
      await queryClient.invalidateQueries({
        queryKey: ["workspace-report", r.config.target],
      });
      await queryClient.invalidateQueries({ queryKey: ["workspace-list"] });
    },
  });
  const context = {
    mode: n?.assessment.classification.mode,
    marketCapUsd: input?.marketCapUsd,
    marketCapRange: input?.marketCapRange,
  };
  const colour = (key: string, value: number | null | undefined) =>
    profile
      ? profileTone(profile, key, value, context)
      : metricTone(key, value, context);
  const watcherTone = colour("watchers", s?.watchers?.value);
  const ageTone = colour("ageDays", input?.ageDays);
  const combined =
    s &&
    s.metrics.bundlersPct.value != null &&
    s.metrics.phishingPct.value != null
      ? s.metrics.bundlersPct.value + s.metrics.phishingPct.value
      : null;
  const combinedTone = colour("combinedPct", combined);
  return (
    <section className="panel">
      <h2>1. Числовой анализ</h2>
      <TransferFeeWarning fee={r.transferFee} />
      <div className="numeric-profile-choice">
        <label>
          Профиль оценки
          <select
            aria-label="Профиль оценки"
            value={selectedProfile?.id ?? "auto"}
            disabled={changeProfile.isPending || disabled}
            onChange={(e) => changeProfile.mutate(e.target.value)}
          >
            <option value="auto">
              Автоматически
              {autoProfile
                ? ` · ${autoProfile.name}`
                : " · недостаточно данных"}
            </option>
            {profiles.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            useUi.getState().setWorkspace(r.config);
            useUi.getState().setPage("profiles");
          }}
        >
          Настроить профили
        </button>
      </div>
      {changeProfile.error && <p role="alert">{changeProfile.error.message}</p>}
      <div className="button-row">
        <button className="primary" disabled={disabled} onClick={onRefresh}>
          {refreshing
            ? "Обновляю числовой анализ…"
            : "Обновить числовой анализ"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!s || !n ? (
        <p>
          {r.errors.gmgn ||
            "Снимок GMGN ещё не получен. Нажмите «Обновить числовой анализ»."}
        </p>
      ) : (
        <>
          <p>
            РЕАЛЬНЫЙ СНИМОК GMGN · {dateText(s.observedAt)}. Давность снимка:{" "}
            {Math.max(
              0,
              Math.floor((Date.now() - Date.parse(s.observedAt)) / 60000),
            )}{" "}
            мин.
          </p>
          <table>
            <tbody>
              <tr>
                <td>Возраст токена</td>
                <td>
                  <span
                    className="metric-value"
                    data-tone={ageTone.kind}
                    style={metricToneStyle(ageTone)}
                    title={`На дату снимка. Создан: ${s.createdAtDisplay || "нет данных"}. ${ageTone.hint}`}
                  >
                    {formatTokenAge(input?.ageDays)}
                  </span>
                  {ageTone.redFlag && <RedFlag hint={ageTone.hint} />}
                </td>
              </tr>
              {(
                [
                  "marketCapUsd",
                  "holderCount",
                  "totalFeesSolEquivalent",
                  "top10Pct",
                  "devPct",
                  "bundlersPct",
                  "phishingPct",
                  "snipersPct",
                  "volume5mUsd",
                  "volume1hUsd",
                ] as const
              ).map((key) => {
                const m = s.metrics[key];
                const tone = colour(
                  key,
                  m.precision === "missing" ? null : m.value,
                );
                return (
                  <Fragment key={key}>
                    <tr>
                      <td>
                        {key === "snipersPct" && <SniperIcon />}
                        {key === "marketCapUsd" && (
                          <MetricIllustration kind="capitalization" />
                        )}
                        {key === "holderCount" && (
                          <MetricIllustration kind="holders" />
                        )}
                        {key === "totalFeesSolEquivalent" && <FeesIcon />}
                        {key === "totalFeesSolEquivalent" &&
                        m.value == null &&
                        s.nativeFees?.amount.value != null
                          ? "Total Fees"
                          : metricLabels[key as keyof typeof metricLabels]}
                      </td>
                      <td>
                        <span
                          className="metric-value"
                          data-tone={tone.kind}
                          style={metricToneStyle(tone)}
                          title={
                            (m.precision === "rounded"
                              ? "Приблизительное значение. "
                              : "") + tone.hint
                          }
                        >
                          {m.precision === "rounded" ? "≈ " : ""}
                          {key === "totalFeesSolEquivalent"
                            ? m.value == null &&
                              s.nativeFees?.amount.value != null
                              ? `${feeDisplay(s.nativeFees.amount)} ${s.nativeFees.asset} · курс SOL недоступен`
                              : feeDisplay(m)
                            : m.display || "Нет данных"}
                        </span>
                        {tone.redFlag && (
                          <RedFlag
                            hint={
                              (m.precision === "rounded"
                                ? "По приблизительному значению: "
                                : "") + tone.hint
                            }
                          />
                        )}
                      </td>
                    </tr>
                    {key === "holderCount" && (
                      <tr>
                        <td>
                          <Eye
                            size={16}
                            aria-hidden="true"
                            style={{
                              display: "inline-block",
                              verticalAlign: "middle",
                              marginRight: 6,
                            }}
                          />
                          Наблюдатели GMGN
                        </td>
                        <td>
                          <span
                            className="metric-value"
                            data-tone={watcherTone.kind}
                            style={metricToneStyle(watcherTone)}
                            title={watcherTone.hint}
                          >
                            {s.watchers?.display || "Нет данных"}
                          </span>
                          {watcherTone.redFlag && (
                            <RedFlag hint={watcherTone.hint} />
                          )}
                        </td>
                      </tr>
                    )}
                    {key === "phishingPct" && (
                      <tr>
                        <td>Бандлеры + phishing, %</td>
                        <td>
                          <span
                            className="metric-value"
                            data-tone={combinedTone.kind}
                            style={metricToneStyle(combinedTone)}
                            title={combinedTone.hint}
                          >
                            {combined == null
                              ? "Нет данных"
                              : `${s.metrics.bundlersPct.precision === "rounded" || s.metrics.phishingPct.precision === "rounded" ? "≈ " : ""}${combined.toLocaleString("ru-RU", { maximumFractionDigits: 4 })}%`}
                          </span>
                          {combinedTone.redFlag && (
                            <RedFlag hint={combinedTone.hint} />
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {r.config.target.chain === "sol" && (
            <MinuteVolumes snapshot={s.minuteVolumes} profile={profile} />
          )}
          {r.errors.gmgn && (
            <p role="alert">
              Обновить GMGN не удалось. Показан сохранённый снимок.
            </p>
          )}
        </>
      )}
    </section>
  );
}
function SocialSummary({
  report: r,
  children,
  pipelineBusy,
}: {
  pipelineBusy?: boolean;
  report: WorkspaceReport;
  children?: ReactNode;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const research = r.research
      .filter((v) => v.handle === r.config.handle)
      .at(-1),
    result = research ? assessProspects(research.input) : null,
    x = r.x,
    m = r.moni,
    summary = summarizeSocial(x, r.config.target, Date.now());
  const prompt = grokPrompt(r.config);
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus("Промпт скопирован.");
    } catch {
      setCopyStatus("Копирование недоступно — выделите текст ниже.");
    }
  }
  return (
    <section className="panel">
      <h2>2. Оценка Twitter · Grok</h2>
      <GrokAnalysis report={r} pipelineBusy={pipelineBusy} />
      {result && !r.grok && (
        <h3>
          {result.score === null
            ? `Неполная оценка: ${result.earned}–${result.upper} / 100`
            : `${result.score} / 100`}{" "}
          · по импорту
        </h3>
      )}
      <p>{summary.description}</p>
      {x && (
        <p>
          Частичный снимок · {dateText(x.observedAt)} ·{" "}
          <button
            className="text-button"
            onClick={() => void api.openExternal(x.sourceUrl)}
          >
            Источник X
          </button>
        </p>
      )}
      {x?.state === "available" && (
        <>
          {!!summary.signals.length && (
            <details>
              <summary>Темы публикаций · {summary.signals.length}</summary>
              {summary.signals.map((s) => (
                <p key={s.code}>
                  {s.text}{" "}
                  {s.sources.map((url, i) => (
                    <button
                      key={url}
                      className="text-button"
                      onClick={() => void api.openExternal(url)}
                    >
                      Источник {i + 1}
                    </button>
                  ))}
                </p>
              ))}
            </details>
          )}
          {!!summary.domains.length && (
            <details>
              <summary>Найденные домены · {summary.domains.length}</summary>
              {summary.domains.map((d) => (
                <p key={d.host}>
                  <code>{d.host}</code>{" "}
                  {d.sources.map((url, i) => (
                    <button
                      className="text-button"
                      key={url}
                      onClick={() => void api.openExternal(url)}
                    >
                      Источник {i + 1}
                    </button>
                  ))}
                </p>
              ))}
            </details>
          )}
          <details>
            <summary>Профиль и публикации · {x.posts.length}</summary>
            <p>
              Подписки: {x.following ?? "неизвестно"}. {x.joined}
            </p>
            <p style={{ whiteSpace: "pre-wrap" }}>{x.bio}</p>
            <p>Сайт: {x.website || "не прочитан"}</p>
            {x.posts.slice(0, 10).map((p) => (
              <details key={p.url}>
                <summary>
                  {p.publishedAt ? dateText(p.publishedAt) : "Дата неизвестна"}{" "}
                  · @{p.author}
                </summary>
                <p style={{ whiteSpace: "pre-wrap" }}>{p.text}</p>
                <button onClick={() => void api.openExternal(p.url)}>
                  Открыть публикацию
                </button>
              </details>
            ))}
          </details>
        </>
      )}
      {research && result && (
        <details>
          <summary>
            Импорт автора · {dateText(research.savedAt)} · покрытие{" "}
            {result.covered}/100
          </summary>
          <p style={{ whiteSpace: "pre-wrap" }}>{research.input.description}</p>
          {research.input.flags.map((f, i) => (
            <p
              key={i}
              className={f.severity === "positive" ? "" : "amber-text"}
            >
              {f.text}{" "}
              <button
                className="text-button"
                onClick={() => void api.openExternal(f.source)}
              >
                Источник
              </button>
            </p>
          ))}
        </details>
      )}
      <h3>Moni Score · аккаунты</h3>
      {r.config.moniEnabled === false && <p>Обновление Getmoni отключено.</p>}
      <table aria-label="Moni Score аккаунтов">
        <thead>
          <tr>
            <th>Аккаунт</th>
            <th>Роль</th>
            <th>Moni Score</th>
            <th>Smarts</th>
            <th>Проверено</th>
            <th>Связь с токеном</th>
          </tr>
        </thead>
        <tbody>
          {r.config.handle && (
            <tr>
              <td>
                <button
                  className="text-button"
                  onClick={() =>
                    void api.openExternal(
                      `https://app.moni.ai/${r.config.handle}`,
                    )
                  }
                >
                  @{r.config.handle}
                </button>
              </td>
              <td>Профиль проекта</td>
              <td>
                <b>{m?.score.toLocaleString("ru-RU") ?? "—"}</b>
              </td>
              <td>{m?.smarts ?? "—"}</td>
              <td>
                {m ? dateText(m.observedAt) : r.errors.moni || "Ещё не получен"}
              </td>
              <td>Карточка проекта</td>
            </tr>
          )}
          {(r.config.relatedAccounts ?? []).map((a) => {
            const snapshot = r.relatedMoni?.find(
              (m) => m.handle === a.handle,
            )?.snapshot;
            return (
              <tr key={`${a.handle}:${a.role}`}>
                <td>
                  <button
                    className="text-button"
                    onClick={() =>
                      void api.openExternal(`https://app.moni.ai/${a.handle}`)
                    }
                  >
                    @{a.handle}
                  </button>
                </td>
                <td>
                  {relatedRoleLabels[a.role]}
                  {a.attribution === "grok" ? " · по Grok" : ""}
                </td>
                <td>
                  <b>{snapshot?.score.toLocaleString("ru-RU") ?? "—"}</b>
                </td>
                <td>{snapshot?.smarts ?? "—"}</td>
                <td>
                  {snapshot
                    ? dateText(snapshot.observedAt)
                    : r.errors[`moni:${a.handle}`] || "Ещё не получен"}
                </td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => void api.openExternal(a.source)}
                  >
                    Источник связи
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!r.config.handle && !r.config.relatedAccounts?.length && (
        <p>Связанные аккаунты пока не найдены.</p>
      )}
      <details>
        <summary>Запрос для Grok</summary>
        <p>Скопируйте запрос в Grok. Ответ здесь автоматически не появится.</p>
        <textarea
          aria-label="Промпт для Grok"
          readOnly
          rows={5}
          value={prompt}
        />
        <button onClick={() => void copyPrompt()}>
          Скопировать промпт Grok
        </button>
        {copyStatus && <p role="status">{copyStatus}</p>}
      </details>
      {children}
    </section>
  );
}
