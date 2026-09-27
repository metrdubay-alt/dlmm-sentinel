import { z } from "zod";

export const criteria = [
  [
    "identity",
    "Подлинность",
    "Связь mint, профиля и сайта",
    5,
    "Совпадение адреса и взаимные ссылки; упоминание само по себе не подтверждает официальность.",
  ],
  [
    "history",
    "Подлинность",
    "Непрерывность истории аккаунта",
    5,
    "История имён, bio, тематики и прежних mint. Старый аккаунт не доказывает покупку или ботов.",
  ],
  [
    "ownership",
    "Подлинность",
    "Прозрачность запуска и CTO",
    5,
    "Дата запуска отдельно от регистрации X; раскрытые смены владельца и команды.",
  ],
  [
    "audience",
    "Аудитория",
    "Активность изученной выборки",
    5,
    "Укажите размер и способ выборки; подозрительные аккаунты не равны доказанным ботам.",
  ],
  [
    "engagement",
    "Аудитория",
    "Содержательность откликов",
    5,
    "Медиана обычных постов, уникальные авторы. Розыгрыши и вирусные посты отдельно.",
  ],
  [
    "growth",
    "Аудитория",
    "Органичность роста",
    5,
    "Сравните датированные снимки подписчиков и причины скачков.",
  ],
  [
    "diversity",
    "Сообщество",
    "Независимые участники",
    5,
    "Разнообразие авторов, доля активности топ-5; участники Community отдельно от followers.",
  ],
  [
    "returning",
    "Сообщество",
    "Возвращаемость за 7/30 дней",
    5,
    "Повторное участие в разные дни; неполная история не позволяет утверждать отсутствие активности.",
  ],
  [
    "dialogue",
    "Сообщество",
    "Диалог команды",
    5,
    "Содержательные ответы, модерация, Spaces, реакция на неудобные вопросы.",
  ],
  [
    "follows",
    "Инфлюенсеры",
    "Подписки значимых аккаунтов",
    2,
    "Кто на кого подписан. Подписка не endorsement; дата обнаружения не дата подписки.",
  ],
  [
    "actions",
    "Инфлюенсеры",
    "Содержательные публичные действия",
    4,
    "Роль, конкретное действие, дата и ссылка; негативное упоминание не поддержка.",
  ],
  [
    "conflicts",
    "Инфлюенсеры",
    "Репутация и конфликты интересов",
    4,
    "Проверенная история продвижения, раскрытие рекламы и владения; не выдумывать статус фонда.",
  ],
  [
    "moni",
    "Moni",
    "Дополнительный сигнал Moni",
    5,
    "Исходный score, дата, ссылка и известная шкала. Повторно не начислять баллы за уже учтённых smart followers.",
  ],
  [
    "catalyst",
    "Тренд",
    "Проверяемый внешний катализатор",
    5,
    "Произошёл ли катализатор; новость об известном лице не означает поддержку токена.",
  ],
  [
    "interest",
    "Тренд",
    "Устойчивость независимого интереса",
    5,
    "Уникальные авторы и тональность за 7/30 дней; одинаковые KOL и синхронные посты требуют проверки.",
  ],
  [
    "differentiation",
    "Тренд",
    "Связь токена с трендом",
    5,
    "Что отличает именно этот токен от копий нарратива.",
  ],
  [
    "product",
    "Экономика",
    "Работающий продукт",
    5,
    "Использование продукта, пользователи, доступная проверка; обещание в посте не доказательство.",
  ],
  [
    "utility",
    "Экономика",
    "Роль токена",
    5,
    "Необходимость токена для продукта. Мем сам по себе не red flag.",
  ],
  [
    "revenue",
    "Экономика",
    "Выручка и права получателей",
    5,
    "Комиссии, оборот и чистая выручка различаются. Укажите получателей, формулу и контроль администратора.",
  ],
  [
    "payouts",
    "Экономика",
    "Реальные выплаты и устойчивость",
    5,
    "Транзакции, валюта, частота, субсидии. Buyback не выплата; проверьте, получает ли доход LP/vault.",
  ],
  [
    "transparency",
    "Коммуникация",
    "Прозрачность обещаний и рекламы",
    5,
    "Выполненные обещания, исправления, раскрытие платного продвижения.",
  ],
].map(([id, group, label, maximum, help]) => ({
  id: String(id),
  group: String(group),
  label: String(label),
  maximum: Number(maximum),
  help: String(help),
}));
const source = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((s) => {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password;
  }, "Нужна HTTPS-ссылка без пароля");
const evidence = { source, observedAt: z.string().datetime() };
export const observationSchema = z
  .object({
    criterion: z.string().refine((s) => criteria.some((c) => c.id === s)),
    level: z.union([
      z.literal(0),
      z.literal(25),
      z.literal(50),
      z.literal(75),
      z.literal(100),
    ]),
    explanation: z.string().trim().min(3).max(3000),
    ...evidence,
  })
  .strict();
export const flagSchema = z
  .object({
    severity: z.enum(["critical", "warning", "positive"]),
    text: z.string().trim().min(3).max(3000),
    ...evidence,
  })
  .strict();
export const prospectsInputSchema = z
  .object({
    mint: z.string().min(1).max(44),
    description: z.string().max(10000),
    projectType: z.enum([
      "unknown",
      "product",
      "no-value-capture",
      "meme",
      "hybrid",
    ]),
    observations: z.array(observationSchema).max(criteria.length),
    flags: z.array(flagSchema).max(30),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      new Set(v.observations.map((o) => o.criterion)).size !==
      v.observations.length
    )
      ctx.addIssue({ code: "custom", message: "Критерий указан повторно" });
    const fingerprints = v.observations.map(
      (o) => `${o.source}|${o.explanation.trim().toLowerCase()}`,
    );
    if (new Set(fingerprints).size !== fingerprints.length)
      ctx.addIssue({
        code: "custom",
        message: "Один и тот же факт нельзя оценивать повторно",
      });
  });
export type ProspectsInput = z.infer<typeof prospectsInputSchema>;
export const prospectsRevisionSchema = z.object({
  savedAt: z.string().datetime(),
  model: z.literal("x-prospects-v1"),
  input: prospectsInputSchema,
});
export function assessProspects(input: unknown) {
  const parsed = prospectsInputSchema.parse(input);
  const rows = criteria.map((c) => {
    const observation = parsed.observations.find((o) => o.criterion === c.id);
    return {
      ...c,
      observation,
      earned: observation ? (c.maximum * observation.level) / 100 : null,
    };
  });
  const earned = rows.reduce((s, r) => s + (r.earned ?? 0), 0);
  const covered = rows
    .filter((r) => r.observation)
    .reduce((s, r) => s + r.maximum, 0);
  const critical = parsed.flags.some((f) => f.severity === "critical");
  return {
    rows,
    earned,
    covered,
    upper: earned + 100 - covered,
    score: covered === 100 ? earned : null,
    provenance:
      "Сведения пользователя; независимо не проверены. Баллы отражают ручную оценку по экспериментальной модели, не вероятность роста.",
    outcome: critical
      ? "Сообщение о критической угрозе — приостановить вход и проверить доказательства"
      : covered < 100
        ? "Данных недостаточно для полного итога"
        : earned >= 75
          ? "Есть основания изучать дальше"
          : earned >= 45
            ? "Спекулятивный интерес"
            : "Слабые основания",
  };
}
