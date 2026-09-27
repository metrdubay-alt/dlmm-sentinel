import type { ProviderId, Veto } from "../schemas/domain";
import { facts, fresh, ids, source, type AnalysisContext } from "./context";
export function vetoEngine(ctx: AnalysisContext): Veto[] {
  const c = facts(ctx, "chain"),
    h = facts(ctx, "holders"),
    m = facts(ctx, "market"),
    r = facts(ctx, "scanner"),
    u = facts(ctx, "url"),
    l = facts(ctx, "legitimacy"),
    age = facts(ctx, "timing").ageHours,
    t = ctx.settings.thresholds;
  const trap = c.extensions?.some((e) => e.dangerous && !e.explained) ?? false;
  const rows: [
    string,
    string,
    string,
    boolean,
    boolean,
    ProviderId[],
    string,
  ][] = [
    [
      "V1_RUGGED_OR_DRAINED_LIQUIDITY",
      "Ликвидность выведена",
      "Rugged or drained liquidity",
      r.rugged === true ||
        m.drained === true ||
        ((m.previousLiquidityUsd ?? 0) >= t.materialLiquidityUsd &&
          m.liquidityUsd !== undefined &&
          m.liquidityUsd <= m.previousLiquidityUsd! * t.drainedFraction),
      r.rugged === true ||
        m.drained === true ||
        (r.rugged !== undefined &&
          (m.drained !== undefined ||
            (m.previousLiquidityUsd !== undefined &&
              m.liquidityUsd !== undefined))),
      ["market", "scanner"],
      "Подтверждённый флаг вывода или остаток ликвидности ниже порога.",
    ],
    [
      "V2_ACTIVE_MINT_AUTHORITY_UNVERIFIED",
      "Непроверенная mint authority",
      "Active unverified mint authority",
      c.mintAuthority === "active-unverified" &&
        age !== undefined &&
        age < t.newTokenHours,
      c.mintAuthority !== undefined &&
        c.mintAuthority !== "unknown" &&
        age !== undefined,
      ["chain", "timing"],
      "У нового токена активна непроверенная возможность выпуска.",
    ],
    [
      "V3_ACTIVE_FREEZE_AUTHORITY_UNVERIFIED",
      "Активная freeze authority",
      "Active freeze authority",
      c.freezeAuthority === "active-unverified" ||
        (c.freezeAuthority === "active-verified" &&
          age !== undefined &&
          age < t.newTokenHours),
      c.freezeAuthority !== undefined && c.freezeAuthority !== "unknown",
      ["chain", "timing"],
      "Активна заморозка: authority не проверена либо токен новый.",
    ],
    [
      "V4_HONEYPOT_OR_SELL_RESTRICTION",
      "Ограничение продажи или перевода",
      "Sell restriction",
      r.honeypot === true || c.sellRestricted === true || trap,
      r.honeypot !== undefined && c.sellRestricted !== undefined,
      ["chain", "scanner"],
      "Обнаружено ограничение продажи или серьёзный необъяснённый риск перевода.",
    ],
    [
      "V5_OFFICIAL_PHISHING_OR_DRAINER_LINK",
      "Опасная ссылка официального канала",
      "Official malicious link",
      u.officialMaliciousLink === true && u.officialChannelConfirmed === true,
      u.officialMaliciousLink !== undefined,
      ["url"],
      "Проверенный официальный канал распространяет классифицированную опасную ссылку.",
    ],
    [
      "V6_DANGEROUS_INSIDER_CONCENTRATION",
      "Критическая доля инсайдеров",
      "Dangerous insider concentration",
      h.insiderIdentified === true &&
        (h.insiderPct ?? 0) >= t.insiderCriticalPct &&
        h.insiderExemptVerified === false,
      h.insiderPct !== undefined &&
        h.insiderIdentified !== undefined &&
        h.insiderExemptVerified !== undefined,
      ["holders"],
      `Установленная группа контролирует ${h.insiderPct ?? "неизвестно"}%; порог ${t.insiderCriticalPct}%. Подтверждённых исключений нет.`,
    ],
    [
      "V7_DEVELOPER_OR_INSIDER_DISTRIBUTION",
      "Значимые продажи инсайдеров",
      "Insider distribution",
      h.devSellProven === true ||
        (h.insiderIdentified === true &&
          (h.insiderSellUsd ?? 0) > 0 &&
          (m.executableLiquidityUsd ?? 0) > 0 &&
          h.insiderSellUsd! / m.executableLiquidityUsd! >= t.insiderSellRatio),
      h.insiderSellUsd !== undefined && m.executableLiquidityUsd !== undefined,
      ["holders", "market"],
      "Продажи подтверждены либо существенны относительно исполнимой ликвидности.",
    ],
    [
      "V8_DEPLOYER_LINKED_TO_PRIOR_RUGS",
      "Связь создателя с прошлыми rug pull",
      "Prior rugs linked to deployer",
      h.priorRugsProven === true,
      h.priorRugsProven !== undefined,
      ["holders"],
      "Связь кошелька подтверждена источником; анонимные обвинения не учитываются.",
    ],
    [
      "V9_CRITICAL_TOKEN_2022_TRAP",
      "Необъяснённый механизм Token-2022",
      "Critical Token-2022 trap",
      trap,
      c.extensions !== undefined,
      ["chain"],
      c.extensions
        ?.filter((e) => e.dangerous && !e.explained)
        .map((e) => `${e.name}: ${e.explanation}`)
        .join("; ") || "Опасный необъяснённый механизм не выявлен.",
    ],
    [
      "V10_CONFIRMED_FAKE_IDENTITY_OR_PARTNERSHIP",
      "Подтверждённое ложное заявление",
      "Confirmed fake identity or partnership",
      l.claimsDisproven === true,
      l.claimsDisproven !== undefined,
      ["legitimacy"],
      "Официальное заявление достоверно опровергнуто заявленной стороной или сильным доказательством.",
    ],
  ];
  return rows.map(
    ([
      id,
      titleRussian,
      titleEnglish,
      triggered,
      known,
      providers,
      reason,
    ]) => ({
      id,
      titleRussian,
      titleEnglish,
      severity: "CRITICAL",
      triggered,
      reason: triggered
        ? reason
        : known
          ? "Условие не обнаружено по доступным данным."
          : "Недостаточно данных для проверки условия.",
      evidenceIds: ids(ctx, providers),
      freshness: known
        ? providers.every((p) => fresh(ctx, p))
          ? "fresh"
          : "stale"
        : "missing",
      confidence: known
        ? Math.min(...providers.map((p) => source(ctx, p)?.confidence ?? 0))
        : 0,
      overridePolicy: "REVIEW_ONLY",
      recommendedAction: triggered ? "DO_NOT_ENTER" : "MANUAL_REVIEW",
      firstSeenAt: triggered ? ctx.now : null,
      lastSeenAt: triggered ? ctx.now : null,
      reviewedAt: null,
      reviewedNote: null,
      status: triggered ? "ACTIVE" : known ? "RESOLVED" : "INSUFFICIENT_DATA",
    }),
  );
}
