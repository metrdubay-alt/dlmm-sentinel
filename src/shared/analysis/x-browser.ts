import { z } from "zod";
import { moniHandleSchema } from "./moni";
const postSchema = z.object({
  url: z.string().url().max(2048),
  author: moniHandleSchema,
  text: z.string().max(12000),
  publishedAt: z.string().datetime().nullable(),
});
export const xProfileSchema = z
  .object({
    handle: moniHandleSchema,
    sourceUrl: z.string().url(),
    observedAt: z.string().datetime(),
    state: z.enum(["available", "unavailable"]),
    official: z.literal(false),
    bio: z.string().max(5000),
    website: z.string().max(2048),
    joined: z.string().max(200),
    followers: z.number().int().nonnegative().nullable(),
    following: z.number().int().nonnegative().nullable(),
    posts: z.array(postSchema).max(100),
    coverage: z.literal("visible-sample"),
    unavailableText: z.string().max(500),
  })
  .strict();
export type XProfile = z.infer<typeof xProfileSchema>;
const rawSchema = z.object({
  url: z.string().max(2048),
  identity: z.string().max(1000),
  bio: z.string().max(5000),
  website: z.string().max(2048),
  joined: z.string().max(200),
  followers: z.string().max(200),
  following: z.string().max(200),
  posts: z.array(postSchema).max(100),
  unavailableText: z.string().max(500),
});
export function allowedX(url: string) {
  try {
    const u = new URL(url);
    return u.origin === "https://x.com" && !u.username && !u.password;
  } catch {
    return false;
  }
}
function count(s: string) {
  const m = /^(\d{1,3}(?:[, \u00a0\u202f]\d{3})+|\d+)\s+[^\d\s].*$/.exec(
    s.trim(),
  );
  if (!m) return null;
  const n = Number(m[1].replace(/[, \u00a0\u202f]/g, ""));
  return Number.isSafeInteger(n) ? n : null;
}
export function parseXProfile(
  input: unknown,
  requested: string,
  observedAt: string,
): XProfile {
  const x = rawSchema.parse(input),
    handle = moniHandleSchema.parse(requested),
    url = new URL(x.url);
  if (
    !allowedX(x.url) ||
    url.pathname.toLowerCase().replace(/\/$/, "") !== `/${handle}`
  )
    throw new Error(
      "Откройте запрошенный профиль X, а не страницу входа или поиска.",
    );
  const identity = x.identity.toLowerCase().split(/\s+/).includes(`@${handle}`);
  const unavailable = [
    "This account doesn’t exist",
    "This account doesn't exist",
    "Account suspended",
    "Такой учетной записи не существует",
    "Такой учётной записи не существует",
    "Учётная запись заблокирована",
  ].some((t) => x.unavailableText.includes(t));
  if (!identity && !unavailable)
    throw new Error(
      "Профиль X не прочитан. Завершите вход и дождитесь загрузки. Ошибка доступа не означает удаление аккаунта.",
    );
  const posts = x.posts.filter((p) => {
    try {
      const u = new URL(p.url);
      return (
        p.author === handle &&
        allowedX(p.url) &&
        new RegExp(`^/${handle}/status/[0-9]+$`, "i").test(u.pathname)
      );
    } catch {
      return false;
    }
  });
  return xProfileSchema.parse({
    handle,
    sourceUrl: `https://x.com/${handle}`,
    observedAt,
    state: identity ? "available" : "unavailable",
    official: false,
    bio: identity ? x.bio : "",
    website: identity ? x.website : "",
    joined: identity ? x.joined : "",
    followers: identity ? count(x.followers) : null,
    following: identity ? count(x.following) : null,
    posts: identity ? [...new Map(posts.map((p) => [p.url, p])).values()] : [],
    coverage: "visible-sample",
    unavailableText: identity ? "" : x.unavailableText,
  });
}
export function compareXProfiles(current: XProfile, previous?: XProfile) {
  const signals: { code: string; text: string }[] = [];
  if (
    !previous ||
    current.handle !== previous.handle ||
    Date.parse(current.observedAt) <= Date.parse(previous.observedAt)
  )
    return signals;
  if (previous.state === "available" && current.state === "unavailable")
    signals.push({
      code: "X_UNAVAILABLE",
      text: "X сообщает о недоступности профиля. Причина и удаление аккаунта не подтверждены.",
    });
  if (current.state === "available" && previous.state === "available") {
    if (
      current.followers !== null &&
      previous.followers !== null &&
      current.followers < previous.followers
    )
      signals.push({
        code: "X_FOLLOWERS_DOWN",
        text: `Подписчики X: ${previous.followers} → ${current.followers}. Это не доказывает отписки инфлюенсеров.`,
      });
    if (current.bio !== previous.bio || current.website !== previous.website)
      signals.push({
        code: "X_IDENTITY_CHANGED",
        text: "Изменилось bio или ссылка профиля X. Проверьте принадлежность и новые домены.",
      });
  }
  return signals;
}
