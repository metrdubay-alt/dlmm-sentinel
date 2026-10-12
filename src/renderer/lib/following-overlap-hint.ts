import type { GrokResult } from "../../shared/analysis/grok";

type OverlapResult = Pick<GrokResult, "handle" | "followingOverlap"> & {
  answer: Pick<GrokResult["answer"], "discoveredProfile">;
};

export function followingOverlapHint(result: OverlapResult | null) {
  const overlap = result?.followingOverlap;
  if (overlap && overlap.state !== "complete") return overlap.message;
  if (result && !result.handle && !result.answer.discoveredProfile)
    return "Акк в X отсутствует";
  return "Проверка появится после анализа Grok.";
}

export function hasNoXAccount(result: OverlapResult | null) {
  return !!(
    result &&
    !result.handle &&
    !result.answer.discoveredProfile &&
    !result.followingOverlap
  );
}
