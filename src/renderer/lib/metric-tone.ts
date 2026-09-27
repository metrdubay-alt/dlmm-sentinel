import {
  metricPolicy,
  type MetricPolicy,
} from "../../shared/analysis/metric-policy";
export const metricTone = metricPolicy;
export function metricToneStyle(t: MetricPolicy) {
  if (t.kind === "neutral") return undefined;
  const saturation = 35 + 60 * t.strength;
  return {
    color: `hsl(${t.kind === "good" ? 145 : 0} ${saturation}% ${t.kind === "good" ? 76 - 9 * t.strength : 83 - 11 * t.strength}%)`,
    backgroundColor: `hsl(${t.kind === "good" ? 145 : 0} 85% 48% / ${0.05 + 0.2 * t.strength})`,
    borderColor: `hsl(${t.kind === "good" ? 145 : 0} ${saturation}% 60% / ${0.2 + 0.5 * t.strength})`,
  };
}
