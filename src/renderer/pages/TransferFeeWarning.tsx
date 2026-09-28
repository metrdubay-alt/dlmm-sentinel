import type { TransferFee } from "../../shared/analysis/transfer-fee";
import { api, dateText } from "../lib/api";
export function TransferFeeWarning({ fee }: { fee?: TransferFee }) {
  if (
    !fee ||
    fee.status !== "configured" ||
    !((fee.percent ?? 0) > 0 || (fee.nextPercent ?? 0) > 0)
  )
    return null;
  const percent = (v: number) =>
    v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  return (
    <div className="transfer-fee-warning" role="alert">
      <strong>
        !!! Комиссия за перевод токена: {percent(fee.percent ?? 0)}%
      </strong>
      <p>
        Удерживается из переводимых токенов. Это расход, а не доход LP.
        {fee.maximumTokens &&
          ` Максимум за перевод: ${fee.maximumTokens} токенов.`}
      </p>
      {fee.nextPercent !== undefined && fee.nextPercent !== fee.percent && (
        <p>
          Запланировано: {percent(fee.nextPercent)}% с эпохи {fee.nextEpoch}.
        </p>
      )}
      {fee.canChange && <p>Создатель настройки может изменить комиссию.</p>}
      <small>
        {fee.stale && `${fee.reason} `}
        {fee.source} · {dateText(fee.observedAt)}
        {fee.sourceUrl && (
          <>
            {" "}
            ·{" "}
            <button
              className="link"
              onClick={() => api.openExternal(fee.sourceUrl!)}
            >
              Источник
            </button>
          </>
        )}
      </small>
    </div>
  );
}
