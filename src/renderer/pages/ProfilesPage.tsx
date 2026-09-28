import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  defaultNumericProfiles,
  numericProfilesSchema,
  profileMetricLabels,
  profileTone,
  type NumericProfile,
  type ProfileMetric,
  type ProfileRule,
} from "../../shared/analysis/numeric-profiles";
import { metricToneStyle } from "../lib/metric-tone";
export function ProfilesPage() {
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings(undefined),
  });
  if (query.error) return <p role="alert">{query.error.message}</p>;
  if (!query.data) return <p>Загружаю профили…</p>;
  return <ProfileEditor initial={query.data.numericProfiles} />;
}
function ProfileEditor({ initial }: { initial: NumericProfile[] }) {
  const [profiles, setProfiles] = useState(() => structuredClone(initial));
  const [selected, setSelected] = useState("runner");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const client = useQueryClient();
  const active = profiles.find((p) => p.id === selected)!;
  const save = useMutation({
    mutationFn: async () => {
      const parsed = numericProfilesSchema.safeParse(profiles);
      if (!parsed.success)
        throw Error(
          parsed.error.issues
            .map((i) => i.message)
            .slice(0, 3)
            .join(" "),
        );
      const settings = await api.settings(undefined);
      return api.saveSettings({ ...settings, numericProfiles: parsed.data });
    },
    onSuccess: async () => {
      setDirty(false);
      setMessage("Профили сохранены. Цвета и флаги в карточках обновлены.");
      await client.invalidateQueries({ queryKey: ["settings"] });
    },
  });
  const update = (fn: (p: NumericProfile) => NumericProfile) => {
    setProfiles((ps) => ps.map((p) => (p.id === selected ? fn(p) : p)));
    setDirty(true);
    setMessage("");
    save.reset();
  };
  const rule = (key: ProfileMetric, patch: Partial<ProfileRule>) =>
    update((p) => ({
      ...p,
      rules: { ...p.rules, [key]: { ...p.rules[key], ...patch } },
    }));
  const field = (
    key: ProfileMetric,
    name: "green" | "red" | "flag" | "strongGood" | "strongBad",
  ) => (
    <input
      aria-label={`${profileMetricLabels[key]}: ${name}`}
      type="number"
      min="0"
      step="any"
      value={active.rules[key][name] ?? ""}
      placeholder={name === "flag" ? "Нет" : ""}
      disabled={!active.rules[key].enabled || save.isPending}
      onChange={(e) =>
        rule(key, {
          [name]:
            e.target.value === ""
              ? name === "flag"
                ? null
                : NaN
              : Number(e.target.value),
        })
      }
    />
  );
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">ПРАВИЛА ЧИСЛОВОГО АНАЛИЗА</span>
          <h1>Профили</h1>
          <p>
            Границы цветов и красных флагов. Изменения применяются к карточкам
            после сохранения.
          </p>
        </div>
        <button
          onClick={() => {
            let i = 1;
            while (profiles.some((p) => p.name === `Новый профиль ${i}`)) i++;
            const p = {
              ...structuredClone(active),
              id: crypto.randomUUID(),
              name: `Новый профиль ${i}`,
            };
            setProfiles([...profiles, p]);
            setSelected(p.id);
            setDirty(true);
            setMessage("");
          }}
          disabled={save.isPending || profiles.length >= 30}
        >
          + Новый профиль
        </button>
      </div>
      <section className="panel profiles-panel">
        <div className="profile-tabs">
          {profiles.map((p) => (
            <button
              key={p.id}
              className={selected === p.id ? "primary" : ""}
              aria-pressed={selected === p.id}
              onClick={() => setSelected(p.id)}
            >
              {p.name || "Без названия"}
            </button>
          ))}
        </div>
        <div className="profile-heading">
          <label>
            Название профиля
            <input
              aria-label="Название профиля"
              maxLength={60}
              disabled={save.isPending}
              value={active.name}
              onChange={(e) => update((p) => ({ ...p, name: e.target.value }))}
            />
          </label>
          <span className="muted">
            {active.id === "runner"
              ? "Автовыбор: возраст ≤5 дней или капа ≤$1 млн"
              : active.id === "slowcook"
                ? "Автовыбор: возраст >5 дней и капа >$1 млн"
                : "Выбирается вручную в карточке токена"}
          </span>
        </div>
        <p className="muted">
          ↑ Больше — лучше: зелёный выше границы, красный ниже. ↓ Меньше —
          лучше: наоборот. Между границами — нейтральный цвет. Насыщенность
          плавно растёт до «яркой» границы.
        </p>
        <div className="profile-table-scroll">
          <table className="profile-rules">
            <thead>
              <tr>
                <th>Показатель</th>
                <th>Лучше</th>
                <th>Зелёный</th>
                <th>Красный</th>
                <th>🚩 Порог</th>
                <th>Включая границу</th>
                <th>Ярко-зелёный</th>
                <th>Ярко-красный</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(profileMetricLabels) as ProfileMetric[]).map(
                (key) => (
                  <tr
                    key={key}
                    className={
                      !active.rules[key].enabled ? "profile-rule-off" : ""
                    }
                  >
                    <td>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`Включить ${profileMetricLabels[key]}`}
                          disabled={save.isPending}
                          checked={active.rules[key].enabled}
                          onChange={(e) =>
                            rule(key, { enabled: e.target.checked })
                          }
                        />
                        {profileMetricLabels[key]}
                      </label>
                    </td>
                    <td>
                      <select
                        aria-label={`${profileMetricLabels[key]}: направление`}
                        disabled={save.isPending || !active.rules[key].enabled}
                        value={active.rules[key].direction}
                        onChange={(e) =>
                          rule(key, {
                            direction: e.target
                              .value as ProfileRule["direction"],
                          })
                        }
                      >
                        <option value="higher">↑ Больше</option>
                        <option value="lower">↓ Меньше</option>
                      </select>
                    </td>
                    <td>{field(key, "green")}</td>
                    <td>{field(key, "red")}</td>
                    <td>{field(key, "flag")}</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${profileMetricLabels[key]}: включая границу`}
                        disabled={save.isPending || !active.rules[key].enabled}
                        checked={active.rules[key].flagInclusive}
                        onChange={(e) =>
                          rule(key, { flagInclusive: e.target.checked })
                        }
                      />
                    </td>
                    <td>{field(key, "strongGood")}</td>
                    <td>{field(key, "strongBad")}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Объём за час использует границы объёма за 5 минут ×12. Пустой порог 🚩
          означает отсутствие красного флага. Total Fees — в эквиваленте SOL.
        </p>
        <div className="profile-preview">
          <span>Пример Top 10:</span>
          {[5, 12, 18, 30, 45].map((v) => {
            const tone = profileTone(active, "top10Pct", v);
            return (
              <span
                key={v}
                className="metric-value"
                style={metricToneStyle(tone)}
              >
                {v}%{tone.redFlag ? " 🚩" : ""}
              </span>
            );
          })}
        </div>
        <div className="button-row">
          <button
            className="primary"
            disabled={save.isPending || !dirty}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Сохраняю…" : "Сохранить профили"}
          </button>
          {["runner", "slowcook"].includes(active.id) && (
            <button
              disabled={save.isPending}
              onClick={() =>
                update(() =>
                  defaultNumericProfiles().find((p) => p.id === active.id)!,
                )
              }
            >
              Вернуть исходные границы
            </button>
          )}
          <span className="muted">
            {dirty ? "Есть несохранённые изменения" : "Сохранено"}
          </span>
        </div>
        {save.error && <p role="alert">{save.error.message}</p>}
        {message && <p role="status">{message}</p>}
      </section>
    </>
  );
}
