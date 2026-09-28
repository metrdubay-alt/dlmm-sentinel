import { expect, it } from "vitest";
import {
  isTransferFeeFlag,
  withoutTransferFeeRate,
} from "../../shared/analysis/grok-social-display";
it("hides duplicate token transfer fee flags without hiding narrative/trading-fee rewards", () => {
  for (const text of [
    "3% transfer tax на все трансферы $WOW",
    "Transfer Fee: 3.00%",
    "Комиссия за перевод 3%",
    "Налог на трансферы токена",
  ])
    expect(isTransferFeeFlag(text)).toBe(true);
  for (const text of [
    "Комиссии с торговли выплачиваются автору",
    "Paid: награды известным людям",
    "Подозрительный перевод команды",
    "Объём вырос на 3%",
  ])
    expect(isTransferFeeFlag(text)).toBe(false);
});

it("removes repeated transfer rates but retains reward mechanics and trading fees", () => {
  expect(
    withoutTransferFeeRate(
      "Механика: 3% налог на трансферы WOW, из которого формируется пул наград GLDx.",
    ),
  ).toBe(
    "Механика: налог на трансферы WOW, из которого формируется пул наград GLDx.",
  );
  expect(withoutTransferFeeRate("Transfer fee: 3%.")).not.toContain("3%");
  expect(
    withoutTransferFeeRate("Комиссии от торговли 3% выплачиваются авторам."),
  ).toContain("3%");
});
