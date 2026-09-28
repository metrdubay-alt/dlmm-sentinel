/** Transfer-fee warnings belong to the numeric section, not social red/green flags. */
export function isTransferFeeFlag(text: string): boolean {
  return /transfer[\s-]*(?:fee|tax)|(?:комисси[\p{L}-]*|налог[\p{L}-]*)\s+(?:за|на|при)\s+(?:(?:кажд[\p{L}]*|все)\s+)?(?:перевод|трансфер|транзакци)/iu.test(
    text,
  );
}

/** Keep the economic mechanism in prose; the numeric fee rate is shown separately. */
export function withoutTransferFeeRate(text: string): string {
  return text
    .replace(
      /\d+(?:[.,]\d+)?\s*%\s*(?=(?:transfer[\s-]*(?:fee|tax)|(?:налог|комисси)[\p{L}-]*\s+(?:за|на)\s+(?:перевод|трансфер|транзакци)))/giu,
      "",
    )
    .replace(
      /((?:transfer[\s-]*(?:fee|tax)|(?:налог|комисси)[\p{L}-]*\s+(?:за|на)\s+(?:перевод|трансфер|транзакци)[\p{L}-]*)\s*(?:[:—–-]|составляет|в размере)?\s*)\d+(?:[.,]\d+)?\s*%/giu,
      "$1",
    );
}
