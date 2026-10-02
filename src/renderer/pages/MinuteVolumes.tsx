import { dateText } from "../lib/api";
import type { NumericProfile } from "../../shared/analysis/numeric-profiles";
import { profileTone } from "../../shared/analysis/numeric-profiles";
import {
  minimumMinuteVolume,
  type MinuteVolumeSnapshot,
} from "../../shared/analysis/minute-volume";
import { metricToneStyle } from "../lib/metric-tone";
const number = (v: number) =>
  v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
export function MinuteVolumes({
  snapshot,
  profile,
}: {
  snapshot?: MinuteVolumeSnapshot;
  profile?: NumericProfile;
}) {
  const min = snapshot ? minimumMinuteVolume(snapshot) : null;
  const rule = profile?.rules.minuteVolumeSol;
  const tone = (v: number | null) =>
    profile
      ? profileTone(profile, "minuteVolumeSol", v)
      : {
          kind: "neutral" as const,
          strength: 0,
          redFlag: false,
          hint: "Выберите профиль оценки",
          quality: null,
        };
  const maximum = Math.max(
    1,
    ...(snapshot?.candles.map((c) => c.volumeSol ?? 0) ?? []),
  );
  return (
    <div
      className="minute-volumes"
      aria-label="V, SOL/min за последние 10 минут"
    >
      <h3>V, SOL/min за последние 10 минут</h3>
      {!snapshot ? (
        <p className="muted">Нет данных</p>
      ) : (
        <>
          <p className="muted">Снимок {dateText(snapshot.observedAt)}</p>
          <div
            className="minute-volume-chart"
            role="list"
            aria-label="Объёмы десяти минутных свечей"
          >
            {snapshot.candles.map((c) => {
              const colour = tone(c.volumeSol);
              const time = new Date(c.time * 1000).toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <div
                  className="minute-volume-column"
                  role="listitem"
                  key={c.time}
                  data-tone={colour.kind}
                  aria-label={`${time}: ${c.volumeSol === null ? "нет данных" : number(c.volumeSol) + " SOL"}`}
                >
                  <span
                    className="minute-volume-number"
                    style={{ color: metricToneStyle(colour)?.color }}
                  >
                    {c.volumeSol === null
                      ? "Нет данных"
                      : `≈ ${number(c.volumeSol)}`}
                  </span>
                  <div className="minute-volume-track">
                    <div
                      className="minute-volume-bar"
                      data-missing={c.volumeSol === null}
                      style={{
                        ...metricToneStyle(colour),
                        height:
                          c.volumeSol === null
                            ? "4px"
                            : `${Math.max(3, (c.volumeSol / maximum) * 100)}%`,
                      }}
                      title={`${time} · ${c.volumeSol === null ? "Нет данных" : number(c.volumeSol) + " SOL"}. ${colour.hint}`}
                    />
                  </div>
                  <time dateTime={new Date(c.time * 1000).toISOString()}>
                    {time}
                  </time>
                </div>
              );
            })}
          </div>
          {rule?.enabled && (
            <p className="muted">
              {profile!.name}: каждая минута{" "}
              {rule.direction === "higher" ? ">" : "<"}
              {number(rule.red)} SOL —{" "}
              {min === null
                ? "пока нельзя проверить"
                : (
                      rule.direction === "higher"
                        ? snapshot.candles.every(
                            (c) =>
                              c.volumeSol !== null && c.volumeSol > rule.red,
                          )
                        : snapshot.candles.every(
                            (c) =>
                              c.volumeSol !== null && c.volumeSol < rule.red,
                          )
                    )
                  ? "условие выполнено"
                  : "условие не выполнено"}
              . Зелёный {rule.direction === "higher" ? ">" : "<"}
              {number(rule.green)}, красный{" "}
              {rule.direction === "higher" ? "<" : ">"}
              {number(rule.red)} SOL/мин.
            </p>
          )}
        </>
      )}
    </div>
  );
}
