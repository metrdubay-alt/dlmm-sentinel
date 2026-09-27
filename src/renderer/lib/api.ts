import type { Api } from "../../shared/schemas/ipc";
declare global {
  interface Window {
    sentinel: Api;
  }
}
export const api = window.sentinel;
export const dateText = (date: string | Date) =>
  new Date(date).toLocaleString("ru-RU");
export const numberText = (n: number | undefined | null) =>
  n === undefined || n === null
    ? "Нет данных"
    : n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
