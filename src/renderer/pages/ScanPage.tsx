import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FlaskConical, SlidersHorizontal } from "lucide-react";
import { api } from "../lib/api";
import { useUi } from "../stores/ui";
import { demoMint, scenarioLabels } from "../../shared/providers/mock/fixtures";
import {
  scanRequestSchema,
  type Position,
  type Scenario,
} from "../../shared/schemas/domain";
export function ScanPage() {
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings(undefined),
  });
  const demo = settings.data?.demoMode ?? true;
  const [mint, setMint] = useState(""),
    [scenario, setScenario] = useState<Scenario>("new-token"),
    [mode, setMode] = useState<"quick" | "deep">("quick"),
    [lp, setLp] = useState(false),
    [error, setError] = useState("");
  const [position, setPosition] = useState<Position>({
    pair: "DEMO / USDC",
    pool: "Демонстрационный пул",
    currentPrice: 1,
    lowerPrice: 0.9,
    upperPrice: 1.1,
    amountUsd: 500,
    horizonHours: 4,
    maxLossPct: 10,
    recorded: false,
  });
  const client = useQueryClient(),
    setReport = useUi((s) => s.setReport);
  const mutation = useMutation({
    mutationFn: api.scan,
    onSuccess: (report) => {
      void client.invalidateQueries({ queryKey: ["reports"] });
      setReport(report);
    },
    onError: (e) => setError(e.message),
  });
  const fields: [keyof Position, string][] = [
    ["currentPrice", "Текущая цена"],
    ["lowerPrice", "Нижняя граница"],
    ["upperPrice", "Верхняя граница"],
    ["amountUsd", "Размер позиции, USD"],
    ["horizonHours", "Горизонт, часов"],
    ["maxLossPct", "Допустимый убыток, %"],
  ];
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">ДЕТЕРМИНИРОВАННЫЙ АНАЛИЗ</span>
          <h1>Проверка токена</h1>
          <p>
            Mint — единственный идентификатор. Название и тикер не подтверждают
            подлинность.
          </p>
        </div>
        <span className="pill neutral">Без API-ключей</span>
      </div>
      <div className="scan-layout">
        <form
          className="panel scan-form"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            const parsed = scanRequestSchema.safeParse({
              mint,
              scenario,
              mode,
              dataMode: demo ? "mock" : "live",
              position: lp && demo ? position : undefined,
            });
            if (!parsed.success) {
              setError(parsed.error.issues.map((i) => i.message).join(" "));
              return;
            }
            mutation.mutate(parsed.data);
          }}
        >
          <h2>Параметры сканирования</h2>
          <label>
            Solana mint address
            <input
              autoComplete="off"
              spellCheck={false}
              placeholder="Вставьте mint address…"
              value={mint}
              onChange={(e) => setMint(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setMint(
                demo ? demoMint : "So11111111111111111111111111111111111111112",
              )
            }
          >
            {demo ? "Подставить адрес для демонстрации" : "Пример: Wrapped SOL"}
          </button>
          <p className="field-help">
            {demo
              ? "В демо-режиме адрес только подписывает отчёт. Результаты относятся к выбранному сценарию, а не к этому токену."
              : "Mint будет отправлен включённым источникам. При сбое вы получите частичный отчёт или явно отмеченный кэш, без демо-подстановок."}
          </p>
          {demo && (
            <label>
              Демонстрационный сценарий
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value as Scenario)}
              >
                {Object.entries(scenarioLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset>
            <legend>Режим сканирования</legend>
            <div className="radio-grid">
              {(["quick", "deep"] as const).map((m) => (
                <label
                  className={mode === m ? "radio-card active" : "radio-card"}
                  key={m}
                >
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === m}
                    onChange={() => setMode(m)}
                  />
                  <span>
                    <b>{m === "quick" ? "Быстрый" : "Глубокий"}</b>
                    <small>
                      {!demo
                        ? m === "quick"
                          ? "До 12 с: основные данные и top-20 счетов"
                          : "До 45 с: дополнительно владельцы top-20 счетов"
                        : m === "quick"
                          ? "Локальная проверка fixtures"
                          : "Те же mock-данные в Phase 2"}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {demo && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={lp}
                onChange={(e) => setLp(e.target.checked)}
              />
              <SlidersHorizontal size={17} /> Учесть параметры DLMM-позиции
            </label>
          )}
          {lp && demo && (
            <div className="lp-form">
              <label>
                Пара
                <select
                  value={position.pair}
                  onChange={(e) =>
                    setPosition({ ...position, pair: e.target.value })
                  }
                >
                  <option>DEMO / USDC</option>
                  <option>DEMO / SOL</option>
                </select>
              </label>
              <div className="form-grid">
                {fields.map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      min="0.000001"
                      step="any"
                      value={String(position[key])}
                      onChange={(e) =>
                        setPosition({
                          ...position,
                          [key]: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={position.recorded}
                  onChange={(e) =>
                    setPosition({ ...position, recorded: e.target.checked })
                  }
                />{" "}
                Считать позицию уже открытой (демо)
              </label>
              <p className="field-help">
                Параметры сохраняются внутри отчёта. Приложение не проверяет
                реальную позицию и не выполняет операции.
              </p>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button
            className="primary full"
            disabled={mutation.isPending || !settings.data}
            type="submit"
          >
            {mutation.isPending
              ? "Анализируем…"
              : demo
                ? "Запустить демо-анализ"
                : "Анализировать токен"}{" "}
            <ArrowRight size={17} />
          </button>
        </form>
        <aside>
          <section className="panel">
            <FlaskConical className="teal" size={27} />
            <h2>
              {demo ? "Один сценарий." : "Один mint."}
              <br />
              Полная цепочка доказательств.
            </h2>
            <p>
              {demo
                ? "В отчёт входят 8 источников, 10 проверок veto, 7 категорий риска и отдельная оценка качества данных."
                : "Проверяем полномочия mint, рыночные пары, RugCheck и Meteora. С API-ключами доступны метрики GMGN, кластеры Bubblemaps, поиск mint в X и история заявленных профилей. Владелец аккаунта, безопасность сайтов и исполнимая глубина независимо не подтверждаются."}
            </p>
            <div className="separator" />
            <h3>Что проверяем</h3>
            <ul className="quiet-list">
              <li>Полномочия контракта</li>
              <li>Холдеров и инсайдеров</li>
              <li>Ликвидность и потоки</li>
              <li>Социальные сигналы</li>
              <li>Возраст и события</li>
            </ul>
          </section>
          <div className="info-note">
            Низкий score не отменяет критический veto. Недоступный источник не
            считается положительным сигналом.
          </div>
        </aside>
      </div>
    </>
  );
}
