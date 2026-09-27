import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, dateText } from "../lib/api";
import {
  defaultSettings,
  providerIds,
  settingsSchema,
  type Settings,
} from "../../shared/schemas/domain";
import {
  categoryKeys,
  categoryLabels,
} from "../../shared/config/risk-thresholds";
import { providerLabels } from "../../shared/providers/provider-registry";
import { MoniPanel } from "./MoniPanel";
const labels: Record<string, string> = {
  newTokenHours: "Новый токен, ч",
  veryNewHours: "Очень новый токен, ч",
  youngTokenHours: "Молодой токен, ч",
  newPoolHours: "Новый пул, ч",
  insiderCriticalPct: "Критическая доля инсайдеров, %",
  insiderHighPct: "Высокая доля инсайдеров, %",
  insiderMediumPct: "Средняя доля инсайдеров, %",
  top1HighPct: "Высокая доля top-1, %",
  top1MediumPct: "Средняя доля top-1, %",
  top10HighPct: "Высокая доля top-10, %",
  top10MediumPct: "Средняя доля top-10, %",
  bundleHighPct: "Высокая доля связанных покупок, %",
  bundleMediumPct: "Средняя доля связанных покупок, %",
  insiderSellRatio: "Продажи / исполнимая ликвидность",
  materialLiquidityUsd: "Значимая ликвидность, USD",
  drainedFraction: "Остаточная доля после вывода",
  lowLiquidityFdvRatio: "Нижний порог ликвидность / FDV",
  maxPositionLiquidityRatio: "Максимальная доля позиции в пуле",
  highVolumeLiquidityRatio: "Высокое отношение объём / ликвидность",
  controlledLiquidityPct: "Контроль ликвидности одной стороной, %",
  parabolicPct: "Параболический рост, %",
  highVolatilityPct: "Высокая волатильность, %",
  boundaryDistancePct: "Расстояние до границы, %",
  confidenceMinimum: "Минимальный confidence",
  confidenceCritical: "Критический confidence",
  riskBlock: "Риск: запрет входа",
  riskElevated: "Риск: высокий",
  riskModerate: "Риск: умеренный",
  chainFreshMinutes: "Свежесть on-chain, мин",
  marketFreshMinutes: "Свежесть рынка, мин",
  holdersFreshMinutes: "Свежесть холдеров, мин",
  scannerFreshMinutes: "Свежесть сканера, мин",
  socialFreshMinutes: "Свежесть соцсетей, мин",
  urlFreshMinutes: "Свежесть URL, мин",
  legitimacyFreshMinutes: "Свежесть проекта, мин",
  timingFreshMinutes: "Свежесть событий, мин",
  unknownAuthorityPoints: "Неизвестная authority, баллы",
  unknownCategoryFraction: "Доля надбавки неизвестной категории",
  mintPoints: "Mint authority, баллы",
  freezePoints: "Freeze authority, баллы",
  trapPoints: "Опасное расширение, баллы",
  metadataPoints: "Изменяемые метаданные, баллы",
  insiderHighPoints: "Высокая доля инсайдеров, баллы",
  insiderMediumPoints: "Средняя доля инсайдеров, баллы",
  top1HighPoints: "Top-1 высокая доля, баллы",
  top1MediumPoints: "Top-1 средняя доля, баллы",
  top10HighPoints: "Top-10 высокая доля, баллы",
  top10MediumPoints: "Top-10 средняя доля, баллы",
  sellingPoints: "Продажи инсайдеров, баллы",
  bundleHighPoints: "Связанные покупки: высокая доля, баллы",
  bundleMediumPoints: "Связанные покупки: средняя доля, баллы",
  controlledLiquidityPoints: "Контроль ликвидности, баллы",
  liquidityFdvPoints: "Низкая ликвидность / FDV, баллы",
  exposurePoints: "Превышение размера позиции, баллы",
  turnoverPoints: "Высокий оборот, баллы",
  washPoints: "Искусственный объём, баллы",
  pumpPoints: "Вертикальный рост, баллы",
  volatilityPoints: "Волатильность, баллы",
  largeSellsPoints: "Крупные продажи, баллы",
  flowSellingPoints: "Давление продаж, баллы",
  warningPoints: "Достоверное предупреждение, баллы",
  kolPoints: "Согласованное продвижение, баллы",
  botPoints: "Ботоподобные сигналы, баллы",
  fakeClaimPoints: "Ложные заявления, баллы",
  followerPoints: "Скачок подписчиков, баллы",
  mismatchPoints: "Несоответствие продукта, баллы",
  promotionPoints: "Реклама без доказательств, баллы",
  contradictionPoints: "Противоречивые заявления, баллы",
  veryNewPoints: "Возраст менее 6 ч, баллы",
  newPoints: "Возраст 6–24 ч, баллы",
  youngPoints: "Возраст 1–7 дней, баллы",
  eventPoints: "Ближайшее событие, баллы",
};
function SettingsForm({ initial }: { initial: Settings }) {
  const [value, setValue] = useState(initial),
    [notice, setNotice] = useState("");
  const client = useQueryClient();
  const savedSettings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings(undefined),
  });
  const credentials = useQuery({
    queryKey: ["credentials"],
    queryFn: () => api.credentialStatus(undefined),
  });
  const changeCredentials = useMutation({
    mutationFn: (action: "import" | "clear") =>
      action === "import"
        ? api.importCredentials(undefined)
        : api.clearCredentials(undefined),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["credentials"] });
      setNotice("API-настройки обновлены.");
    },
    onError: (e) => setNotice(e.message),
  });
  const history = useQuery({
    queryKey: ["settingsHistory"],
    queryFn: () => api.settingsHistory(undefined),
  });
  const save = useMutation({
    mutationFn: api.saveSettings,
    onSuccess: () => {
      setNotice("Настройки сохранены. Применяются к новым сканам.");
      void client.invalidateQueries({ queryKey: ["settingsHistory"] });
      void client.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => setNotice(e.message),
  });
  return (
    <>
      <MoniPanel demo={savedSettings.data?.demoMode ?? true} />
      <section className="panel">
        <h2>Источники и режим</h2>
        <label>
          Режим анализа
          <select
            aria-label="Режим данных"
            value={value.demoMode ? "mock" : "live"}
            onChange={(e) =>
              setValue({ ...value, demoMode: e.target.value === "mock" })
            }
          >
            <option value="mock">ДЕМО-ДАННЫЕ</option>
            <option value="live">Реальные источники · только чтение</option>
          </select>
        </label>
        <p>
          Примените настройки кнопкой сохранения ниже. В реальном режиме mint
          отправляется включённым API. X, GMGN и Bubblemaps требуют собственных
          API-ключей; запросы могут расходовать кредиты сервиса.
        </p>
        <div className="provider-grid">
          {providerIds
            .filter(
              (id) =>
                value.demoMode ||
                ["chain", "holders", "market", "scanner", "social"].includes(
                  id,
                ),
            )
            .map((id) => (
              <label className="checkbox" key={id}>
                <input
                  type="checkbox"
                  checked={value.providers[id]}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      providers: { ...value.providers, [id]: e.target.checked },
                    })
                  }
                />
                {value.demoMode
                  ? providerLabels[id]
                  : (
                      {
                        chain: "Solana RPC",
                        holders: "Крупнейшие token accounts",
                        market: "DexScreener",
                        scanner: "RugCheck",
                        social: "X · поиск упоминаний mint",
                      } as Record<string, string>
                    )[id]}
              </label>
            ))}
        </div>
        {!value.demoMode && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={value.liveMeteora}
              onChange={(e) =>
                setValue({ ...value, liveMeteora: e.target.checked })
              }
            />
            Meteora DLMM
          </label>
        )}
        <h3>API-настройки</h3>
        <div className="button-row">
          {[
            ["Получить доступ X", "https://console.x.com/"],
            ["Документация GMGN", "https://github.com/GMGNAI/gmgn-skills"],
            ["Кабинет Bubblemaps", "https://pro.bubblemaps.io/"],
          ].map(([label, url]) => (
            <button
              className="text-button"
              key={url}
              onClick={() => void api.openExternal(url)}
            >
              {label}
            </button>
          ))}
        </div>
        {!value.demoMode &&
          (["liveGmgn", "liveBubblemaps"] as const).map((key) => (
            <label className="checkbox" key={key}>
              <input
                type="checkbox"
                checked={value[key]}
                onChange={(e) =>
                  setValue({ ...value, [key]: e.target.checked })
                }
              />
              {key === "liveGmgn"
                ? "GMGN · кошельки и метрики"
                : "Bubblemaps · кластеры"}
            </label>
          ))}
        <p>
          Публичные запросы работают без ключей, но могут ограничиваться
          провайдером. Можно импортировать JSON с полями rpcEndpoint,
          rugcheckKey, xBearerToken, gmgnKey, bubblemapsKey. Новые поля
          дополняют сохранённые ключи. Ключи шифруются средствами Windows и не
          передаются в интерфейс или экспорт. Исходный JSON остаётся в выбранной
          вами папке.
        </p>
        <p>
          X: {credentials.data?.xConfigured ? "ключ сохранён" : "нет ключа"} ·
          GMGN:{" "}
          {credentials.data?.gmgnConfigured ? "ключ сохранён" : "нет ключа"} ·
          Bubblemaps:{" "}
          {credentials.data?.bubblemapsConfigured
            ? "ключ сохранён"
            : "нет ключа"}
          .
        </p>
        <p>
          «Ключ сохранён» не означает успешное подключение. Проверка выполняется
          при новом скане; результат виден во вкладке «Источники». X: быстрый
          режим — 7 дней, глубокий — 30 дней. Общий поиск за 30 дней требует
          full-archive доступа; история заявленного профиля запрашивается
          отдельно. Совпадение mint не доказывает подлинность аккаунта.
        </p>
        <p>
          RPC:{" "}
          {credentials.data?.rpcConfigured
            ? "личный endpoint"
            : "публичный endpoint"}{" "}
          · RugCheck:{" "}
          {credentials.data?.rugcheckConfigured ? "ключ настроен" : "без ключа"}
          {credentials.data?.error
            ? " · Ошибка чтения защищённых настроек"
            : ""}
        </p>
        <button
          disabled={changeCredentials.isPending}
          onClick={() => changeCredentials.mutate("import")}
        >
          Импорт API-настроек
        </button>{" "}
        <button
          disabled={changeCredentials.isPending}
          onClick={() => changeCredentials.mutate("clear")}
        >
          Удалить API-настройки
        </button>
      </section>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = settingsSchema.safeParse(value);
          if (!parsed.success) {
            setNotice(parsed.error.issues.map((x) => x.message).join(" "));
            return;
          }
          save.mutate(parsed.data);
        }}
      >
        <section className="panel">
          <h2>Веса категорий</h2>
          <p>
            Сумма должна быть 100. Критические veto работают независимо от
            весов.
          </p>
          <div className="settings-grid">
            {categoryKeys.map((key) => (
              <label key={key}>
                {categoryLabels[key]}
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={value.weights[key]}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      weights: {
                        ...value.weights,
                        [key]: Number(e.target.value),
                      },
                    })
                  }
                />
                <small>По умолчанию: {defaultSettings.weights[key]}</small>
              </label>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>Пороги, свежесть и начисления</h2>
          <p>
            Изменения требуют подтверждения. Уже рассчитанные отчёты сохраняют
            исходные правила. Критические проверки V1–V10 нельзя скрыть или
            отключить.
          </p>
          <div className="settings-grid">
            {(
              Object.keys(value.thresholds) as (keyof Settings["thresholds"])[]
            ).map((key) => (
              <label key={key}>
                {labels[key] ?? key}
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={value.thresholds[key]}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      thresholds: {
                        ...value.thresholds,
                        [key]: Number(e.target.value),
                      },
                    })
                  }
                />
                <small>По умолчанию: {defaultSettings.thresholds[key]}</small>
              </label>
            ))}
          </div>
          <div className="button-row">
            <button className="primary" disabled={save.isPending}>
              Сохранить настройки
            </button>
            <button
              type="button"
              onClick={() => {
                setValue(structuredClone(defaultSettings));
                setNotice(
                  "Значения сброшены в форме. Нажмите «Сохранить настройки» для применения.",
                );
              }}
            >
              Вернуть значения по умолчанию
            </button>
          </div>
          {notice && (
            <p role="status" className="info-note">
              {notice}
            </p>
          )}
        </section>
      </form>
      <section className="panel">
        <h2>История изменений</h2>
        {history.data?.length ? (
          history.data.map((h) => (
            <details key={h.id}>
              <summary>{dateText(h.createdAt)}</summary>
              <div className="raw-grid">
                <pre>
                  До: {JSON.stringify(JSON.parse(h.beforeJson), null, 2)}
                </pre>
                <pre>
                  После: {JSON.stringify(JSON.parse(h.afterJson), null, 2)}
                </pre>
              </div>
            </details>
          ))
        ) : (
          <p>Настройки ещё не изменялись.</p>
        )}
      </section>
      <section className="panel">
        <h2>Локальные данные и конфиденциальность</h2>
        <p>
          Отчёты, снимки и настройки находятся в SQLite в каталоге данных
          приложения. В демо-режиме запросы к провайдерам не отправляются.
          Экспорт может содержать введённые mint и параметры позиции.
        </p>
        <div className="button-row">
          <button
            onClick={() =>
              void api
                .exportData(undefined)
                .then((ok) =>
                  setNotice(ok ? "Экспорт сохранён." : "Экспорт отменён."),
                )
                .catch((e) => setNotice(String(e)))
            }
          >
            Экспорт локальных данных
          </button>
          <button
            className="danger-button"
            onClick={() =>
              void api
                .deleteData("DELETE_LOCAL_DATA")
                .then((ok) => {
                  if (ok) {
                    useUiReset();
                    void client.invalidateQueries();
                    setValue(structuredClone(defaultSettings));
                  }
                })
                .catch((e) => setNotice(String(e)))
            }
          >
            Удалить локальные данные
          </button>
        </div>
        <p>
          API-ключи импортируются только локально. Seed phrase и приватные ключи
          кошелька не принимаются.
        </p>
      </section>
    </>
  );
}
import { useUi } from "../stores/ui";
function useUiReset() {
  useUi.getState().setReport(null);
}
export function SettingsPage() {
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings(undefined),
  });
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">ЛОКАЛЬНАЯ КОНФИГУРАЦИЯ</span>
          <h1>Настройки</h1>
          <p>Источники, правила и управление данными.</p>
        </div>
        <span className="pill neutral">v0.3.2</span>
      </div>
      {settings.error ? (
        <p role="alert" className="error">
          {settings.error.message}
        </p>
      ) : settings.data ? (
        <SettingsForm initial={settings.data} />
      ) : (
        <p>Загрузка…</p>
      )}
    </>
  );
}
