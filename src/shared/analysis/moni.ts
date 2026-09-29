import { z } from "zod";

export const moniHandleSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/^@/, "").toLowerCase())
  .pipe(
    z
      .string()
      .regex(
        /^[a-z0-9_]{1,15}$/,
        "Введите имя аккаунта X, например ArtificiallyInu.",
      ),
  );
const exactCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const moniSnapshotSchema = z
  .object({
    handle: moniHandleSchema,
    sourceUrl: z.string().url(),
    observedAt: z.string().datetime(),
    score: exactCount,
    smarts: exactCount.nullable(),
    visibleSmarts: z.array(moniHandleSchema).max(1000),
    listComplete: z.literal(false),
    source: z.literal("moni-browser"),
    parserVersion: z.enum(["moni-dom-1", "moni-profile-1"]),
  })
  .strict();
export type MoniSnapshot = z.infer<typeof moniSnapshotSchema>;
export function parseMoniProfileResponse(
  raw: unknown,
  requested: string,
  at: string,
): MoniSnapshot {
  const value = z
    .object({
      username: moniHandleSchema,
      score: exactCount,
      smartFollowersCount: exactCount.nullable().optional(),
    })
    .parse(raw);
  const handle = moniHandleSchema.parse(requested);
  if (value.username !== handle)
    throw Error("Ответ Getmoni относится к другому аккаунту");
  return moniSnapshotSchema.parse({
    handle,
    sourceUrl: `https://app.moni.ai/${handle}`,
    observedAt: at,
    score: value.score,
    smarts: value.smartFollowersCount ?? null,
    visibleSmarts: [],
    listComplete: false,
    source: "moni-browser",
    parserVersion: "moni-profile-1",
  });
}
export const moniHistorySchema = z.array(moniSnapshotSchema).max(100);

export function allowedMoniNavigation(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ["app.moni.ai", "profile.moni.ai"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
export class MoniReadError extends Error {
  constructor(
    readonly code: "not-found" | "limit" | "signed-out",
    message: string,
  ) {
    super(message);
    this.name = "MoniReadError";
  }
}
const cardSchema = z.object({
  url: z.string().max(2048),
  profileHref: z.string().max(2048),
  scoreText: z.string().max(100),
  notFound: z.boolean().optional(),
  smartsText: z.string().max(100),
  smartHrefs: z.array(z.string().max(2048)).max(1000),
});
function integer(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) ? n : null;
}
export function parseMoniCard(
  raw: unknown,
  requested: string,
  observedAt: string,
): MoniSnapshot {
  const card = cardSchema.parse(raw);
  const handle = moniHandleSchema.parse(requested);
  const url = new URL(card.url);
  if (
    card.notFound &&
    url.origin === "https://app.moni.ai" &&
    url.pathname.toLowerCase().replace(/\/$/, "") === `/${handle}`
  )
    throw new MoniReadError(
      "not-found",
      `GetMoni: профиль @${handle} не найден.`,
    );
  const profile = new URL(card.profileHref);
  if (
    !allowedMoniNavigation(card.url) ||
    url.hostname !== "app.moni.ai" ||
    url.pathname.toLowerCase().replace(/\/$/, "") !== `/${handle}` ||
    profile.origin !== "https://x.com" ||
    profile.pathname.toLowerCase().replace(/\/$/, "") !== `/${handle}` ||
    profile.username ||
    profile.password
  )
    throw new Error(
      "Карточка Moni не совпадает с запрошенным аккаунтом. Завершите вход и откройте нужный профиль.",
    );
  const score = integer(card.scoreText);
  if (score === null)
    throw new Error(
      "Точный Moni Score не найден. Завершите вход и дождитесь загрузки карточки; возможно, изменился формат сайта.",
    );
  const visibleSmarts = [
    ...new Set(
      card.smartHrefs.flatMap((href) => {
        const match = /^\/([a-zA-Z0-9_]{1,15})$/.exec(href);
        return match ? [match[1].toLowerCase()] : [];
      }),
    ),
  ];
  return moniSnapshotSchema.parse({
    handle,
    sourceUrl: `https://app.moni.ai/${handle}`,
    observedAt,
    score,
    smarts: integer(card.smartsText),
    visibleSmarts,
    listComplete: false,
    source: "moni-browser",
    parserVersion: "moni-dom-1",
  });
}
export function compareMoni(current: MoniSnapshot, previous?: MoniSnapshot) {
  const comparable =
    previous &&
    current.handle === previous.handle &&
    current.parserVersion === previous.parserVersion &&
    Date.parse(current.observedAt) > Date.parse(previous.observedAt);
  const scoreDelta = comparable ? current.score - previous.score : null;
  return { scoreDelta, needsReview: scoreDelta !== null && scoreDelta < 0 };
}
