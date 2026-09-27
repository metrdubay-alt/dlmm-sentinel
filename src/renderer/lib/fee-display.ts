/** Presentation only; calculations continue to use the original measurement. */
export function feeDisplay(measurement: {
  value: number | null;
  display: string;
}) {
  return measurement.value === null || !Number.isFinite(measurement.value)
    ? measurement.display || "Нет данных"
    : measurement.value.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}
