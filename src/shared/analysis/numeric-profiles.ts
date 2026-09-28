import { z } from "zod";
import {
  holderThresholds,
  type MetricContext,
  type MetricPolicy,
} from "./metric-policy";
export const profileMetricLabels = {
  ageDays: "Age · Возраст токена, дней",
  top10Pct: "Top 10, %",
  bundlersPct: "Бандлеры, %",
  phishingPct: "Phishing, %",
  combinedPct: "Бандлеры + phishing, %",
  volume5mUsd: "Объём за 5 минут, $",
  holderCountLow: "Холдеры · капа $300 тыс.–1 млн",
  holderCountHigh: "Холдеры · капа >$1 млн",
  totalFeesSolEquivalent: "Total Fees, эквивалент SOL",
  watchers: "Наблюдатели GMGN",
  marketCapUsd: "Капитализация, $",
  snipersPct: "Снайперы, %",
  devPct: "Доля разработчика, %",
} as const;
export type ProfileMetric = keyof typeof profileMetricLabels;
const number = z.number().finite().nonnegative().max(1e15);
export const profileRuleSchema = z
  .object({
    enabled: z.boolean(),
    direction: z.enum(["higher", "lower"]),
    green: number,
    red: number,
    flag: number.nullable(),
    flagInclusive: z.boolean(),
    strongGood: number,
    strongBad: number,
  })
  .strict()
  .superRefine((v, c) => {
    if (!v.enabled) return;
    const higher = v.direction === "higher";
    if (
      higher
        ? v.red > v.green ||
          v.strongGood < v.green ||
          v.strongBad > v.red ||
          (v.flag !== null && v.flag > v.red)
        : v.green > v.red ||
          v.strongGood > v.green ||
          v.strongBad < v.red ||
          (v.flag !== null && v.flag < v.red)
    )
      c.addIssue({
        code: "custom",
        message:
          "Неверный порядок границ: яркий красный → красный → нейтральный → зелёный → яркий зелёный.",
      });
  });
export type ProfileRule = z.infer<typeof profileRuleSchema>;
const shape = Object.fromEntries(
  Object.keys(profileMetricLabels).map((k) => [k, profileRuleSchema]),
) as Record<ProfileMetric, typeof profileRuleSchema>;
export const numericProfileSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().trim().min(1, "Укажите название").max(60),
    rules: z.object(shape).strict(),
  })
  .strict();
export type NumericProfile = z.infer<typeof numericProfileSchema>;
export const numericProfilesSchema = z
  .array(numericProfileSchema)
  .min(2)
  .max(30)
  .superRefine((p, c) => {
    if (
      new Set(p.map((x) => x.id)).size !== p.length ||
      new Set(p.map((x) => x.name.toLowerCase())).size !== p.length
    )
      c.addIssue({
        code: "custom",
        message: "Названия и идентификаторы профилей должны быть уникальными.",
      });
    if (
      !p.some((x) => x.id === "runner") ||
      !p.some((x) => x.id === "slowcook")
    )
      c.addIssue({
        code: "custom",
        message: "Нужны базовые профили раннеров и слоукуков.",
      });
    for (const profile of p)
      for (const [key, r] of Object.entries(profile.rules))
        if (
          key.endsWith("Pct") &&
          [r.green, r.red, r.flag ?? 0, r.strongGood, r.strongBad].some(
            (v) => v > 100 && key !== "combinedPct",
          )
        )
          c.addIssue({
            code: "custom",
            message: `${profileMetricLabels[key as ProfileMetric]}: процент не должен превышать 100.`,
          });
  });
const higher = (
  red: number,
  green: number,
  flag: number | null,
  enabled = true,
): ProfileRule => ({
  enabled,
  direction: "higher",
  red,
  green,
  flag,
  flagInclusive: false,
  strongGood: green * 2,
  strongBad: flag ?? 0,
});
const lower = (
  green: number,
  red: number,
  flag: number | null,
  strongBad = 100,
): ProfileRule => ({
  enabled: true,
  direction: "lower",
  red,
  green,
  flag,
  flagInclusive: false,
  strongGood: 0,
  strongBad,
});
export function defaultNumericProfiles(): NumericProfile[] {
  return (["runner", "slowcook"] as const).map((id) => ({
    id,
    name: id === "runner" ? "Раннеры" : "Слоукуки",
    rules: {
      top10Pct: { ...lower(10, 15, 22, 45), flagInclusive: true },
      bundlersPct: lower(10, 15, null, 50),
      phishingPct: lower(10, 15, null, 50),
      combinedPct: lower(0, 50, 50, 100),
      volume5mUsd:
        id === "runner"
          ? higher(80000, 100000, 50000)
          : higher(40000, 50000, 25000),
      holderCountLow: higher(1000, 1500, 1000),
      holderCountHigh: higher(1800, 3000, 1800),
      totalFeesSolEquivalent: higher(150, 200, 100, id === "slowcook"),
      watchers: higher(200, 400, 100),
      marketCapUsd: higher(1000000, 1000000, null, id === "slowcook"),
      ageDays: higher(5, 5, null, false),
      snipersPct: { ...lower(10, 15, null), enabled: false },
      devPct: { ...lower(5, 10, null), enabled: false },
    },
  }));
}
export function profileTone(
  p: NumericProfile,
  key: string,
  value: number | null | undefined,
  c: MetricContext = {},
): MetricPolicy {
  const neutral = (hint: string): MetricPolicy => ({
    kind: "neutral",
    strength: 0,
    redFlag: false,
    hint,
    quality: null,
  });
  if (value == null || !Number.isFinite(value) || value < 0)
    return neutral("Нет данных");
  const hourly = key === "volume1hUsd";
  if (hourly) {
    key = "volume5mUsd";
    value /= 12;
  }
  if (key === "holderCount") {
    const h = holderThresholds(c);
    if (!h)
      return neutral("Границы холдеров заданы для капитализации от $300 тыс.");
    key = h.red === 1800 ? "holderCountHigh" : "holderCountLow";
  }
  const rule = p.rules[key as ProfileMetric];
  if (!rule?.enabled)
    return neutral("Цветовые границы для показателя отключены");
  const factor = hourly ? 12 : 1;
  const f = (n: number) => (n * factor).toLocaleString("ru-RU");
  const up = rule.direction === "higher";
  const flag =
    rule.flag !== null &&
    (up
      ? rule.flagInclusive
        ? value <= rule.flag
        : value < rule.flag
      : rule.flagInclusive
        ? value >= rule.flag
        : value > rule.flag);
  const hint = `${p.name}: зелёный ${up ? ">" : "<"}${f(rule.green)}; красный ${up ? "<" : ">"}${f(rule.red)}${rule.flag === null ? "" : `; 🚩 ${up ? (rule.flagInclusive ? "≤" : "<") : rule.flagInclusive ? "≥" : ">"}${f(rule.flag)}`}`;
  const good = up ? value > rule.green : value < rule.green;
  const bad = flag || (up ? value < rule.red : value > rule.red);
  if (!good && !bad) return { ...neutral(hint), quality: 0.5 };
  const boundary = good ? rule.green : rule.red;
  const extreme = good ? rule.strongGood : rule.strongBad;
  const strength = Math.min(
    1,
    Math.max(
      0.04,
      Math.abs(value - boundary) /
        Math.max(Math.abs(extreme - boundary), 0.000001),
    ),
  );
  return {
    kind: bad ? "bad" : "good",
    strength,
    redFlag: flag,
    hint,
    quality: bad ? 0 : 1,
  };
}
export function formatTokenAge(days: number | null | undefined) {
  if (days == null || !Number.isFinite(days) || days < 0) return "Нет данных";
  const mins = Math.floor(days * 1440),
    d = Math.floor(mins / 1440),
    h = Math.floor((mins % 1440) / 60),
    m = mins % 60;
  return d ? `${d} д. ${h} ч.` : h ? `${h} ч. ${m} мин.` : `${m} мин.`;
}
