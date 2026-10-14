import type { MetricPolicy } from "./metric-policy";

export type FeeVolumeInput = {
  totalFeesNative: number | null;
  nativeUsd: number | null;
  volumeUsd: number | null;
};

export type FeeVolume = {
  feesUsd: number;
  volumeUsd: number;
  percent: number;
};

const neutral = (hint: string): MetricPolicy => ({
  kind: "neutral",
  strength: 0,
  redFlag: false,
  hint,
  quality: null,
});

export function calculateFeeVolume(input: FeeVolumeInput): FeeVolume | null {
  const { totalFeesNative, nativeUsd, volumeUsd } = input;
  if (
    totalFeesNative == null ||
    nativeUsd == null ||
    volumeUsd == null ||
    !Number.isFinite(totalFeesNative) ||
    !Number.isFinite(nativeUsd) ||
    !Number.isFinite(volumeUsd) ||
    totalFeesNative < 0 ||
    nativeUsd <= 0 ||
    volumeUsd <= 0
  )
    return null;
  const feesUsd = totalFeesNative * nativeUsd;
  return Number.isFinite(feesUsd)
    ? { feesUsd, volumeUsd, percent: (feesUsd / volumeUsd) * 100 }
    : null;
}

export function feeVolumeTone(
  percent: number | null | undefined,
): MetricPolicy {
  if (percent == null || !Number.isFinite(percent) || percent < 0)
    return neutral("Нужны Total Fees и объём полного диапазона GMGN.");
  if (percent < 0.35)
    return {
      kind: "bad",
      strength: 1,
      redFlag: true,
      hint: "Красный флаг: Fees / Vol меньше 0,35%.",
      quality: 0,
    };
  if (percent < 0.5)
    return {
      kind: "bad",
      strength: (0.5 - percent) / 0.15,
      redFlag: false,
      hint: "Красная зона: Fees / Vol от 0,35% до 0,50%.",
      quality: 0.25,
    };
  if (percent <= 0.75)
    return neutral("Серая зона: Fees / Vol от 0,50% до 0,75%.");
  return {
    kind: "good",
    strength: Math.min(1, (percent - 0.75) / 0.75),
    redFlag: false,
    hint: "Зелёная зона: Fees / Vol больше 0,75%.",
    quality: 1,
  };
}
