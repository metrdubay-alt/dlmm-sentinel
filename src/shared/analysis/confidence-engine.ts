import type { ProviderId, Report } from "../schemas/domain";
import { facts, fresh, source, type AnalysisContext } from "./context";
export function confidenceEngine(ctx: AnalysisContext): Report["confidence"] {
  const c = facts(ctx, "chain"),
    r = facts(ctx, "scanner");
  const conflicts: string[] = [];
  if (
    c.mintAuthority !== undefined &&
    c.mintAuthority !== "unknown" &&
    r.scannerMintActive !== undefined &&
    r.scannerMintActive !== (c.mintAuthority !== "revoked")
  )
    conflicts.push(
      "Risk scanner противоречит прямым on-chain данным о mint authority. Приоритет у on-chain.",
    );
  const coverage: [ProviderId, number, boolean][] = [
    [
      "chain",
      25,
      c.mintAuthority !== undefined &&
        c.mintAuthority !== "unknown" &&
        c.freezeAuthority !== undefined &&
        c.freezeAuthority !== "unknown",
    ],
    ["market", 20, facts(ctx, "market").liquidityUsd !== undefined],
    ["holders", 15, facts(ctx, "holders").insiderPct !== undefined],
    ["scanner", 15, r.honeypot !== undefined],
    ["social", 10, facts(ctx, "social").accountVerified !== undefined],
    ["url", 5, facts(ctx, "url").officialMaliciousLink !== undefined],
  ];
  const components = coverage.map(([id, maximum, complete]) => ({
    id,
    maximum,
    points:
      complete && fresh(ctx, id)
        ? (maximum * (source(ctx, id)?.confidence ?? 0)) / 100
        : 0,
    reason: !complete
      ? "Недостаточно данных"
      : fresh(ctx, id)
        ? "Данные доступны и свежие"
        : "Данные устарели или неполны",
  }));
  const consistent =
    conflicts.length === 0 && components.every((c) => c.points === c.maximum);
  components.push({
    id: "consistency" as ProviderId,
    maximum: 10,
    points: consistent ? 10 : 0,
    reason: consistent
      ? "Источники согласованы"
      : "Недостаточно независимого покрытия или есть противоречие",
  });
  const total = Math.floor(components.reduce((a, b) => a + b.points, 0));
  if (!ctx.settings.demoMode) {
    const groups: [ProviderId, number, (keyof typeof c)[]][] = [
      [
        "chain",
        25,
        [
          "mintAuthority",
          "freezeAuthority",
          "tokenProgram",
          "extensions",
          "metadataMutableUnverified",
          "sellRestricted",
        ],
      ],
      [
        "market",
        20,
        [
          "liquidityUsd",
          "volumeUsd",
          "fdvUsd",
          "poolAgeHours",
          "priceHistorySufficient",
          "volatilityPct",
        ],
      ],
      ["holders", 15, ["insiderPct", "top1Pct", "top10Pct"]],
      ["scanner", 15, ["rugged", "honeypot", "scannerMintActive"]],
      ["social", 10, ["accountVerified", "securityWarningCredible"]],
      ["url", 5, ["officialMaliciousLink", "officialChannelConfirmed"]],
    ];
    const liveComponents = groups.map(([id, maximum, fields]) => {
      const s = source(ctx, id),
        f = facts(ctx, id);
      const usable =
        s &&
        !s.stale &&
        Date.parse(s.fetchedAt) <= Date.parse(ctx.now) &&
        Date.parse(s.expiresAt) > Date.parse(ctx.now);
      const count = fields.filter(
        (k) => f[k] !== undefined && f[k] !== "unknown",
      ).length;
      return {
        id,
        maximum,
        points: usable
          ? Math.floor(
              ((maximum * count) / fields.length) * (s.confidence / 100),
            )
          : 0,
        reason: `Подтверждено полей: ${count}/${fields.length}; ${usable ? "снимок свежий" : "нет свежего снимка"}.`,
      };
    });
    const value = liveComponents.reduce((a, b) => a + b.points, 0);
    return {
      total: value,
      components: [
        ...liveComponents,
        {
          id: "consistency",
          maximum: 10,
          points: 0,
          reason: conflicts.length
            ? "Источники противоречат друг другу"
            : "Недостаточно независимого покрытия",
        },
      ],
      conflicts,
      band:
        value >= 80
          ? "HIGH_CONFIDENCE"
          : value >= 60
            ? "USABLE_CONFIDENCE"
            : value >= 40
              ? "LIMITED_CONFIDENCE"
              : "INSUFFICIENT_CONFIDENCE",
    };
  }
  return {
    total,
    components,
    conflicts,
    band:
      total >= 80
        ? "HIGH_CONFIDENCE"
        : total >= 60
          ? "USABLE_CONFIDENCE"
          : total >= 40
            ? "LIMITED_CONFIDENCE"
            : "INSUFFICIENT_CONFIDENCE",
  };
}
