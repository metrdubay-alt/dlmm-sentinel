import { z } from "zod";
import { moniHandleSchema } from "./moni";

const sourceUrl = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  });
const message = z.string().trim().min(1).max(300);

const completeSchema = z
  .object({
      state: z.literal("complete"),
      targetHandle: moniHandleSchema,
      sourceUrl,
      observedAt: z.string().datetime(),
      followingTotal: z.number().int().nonnegative(),
      matchedFollowing: z.number().int().nonnegative(),
    })
  .strict()
  .refine((v) => v.matchedFollowing <= v.followingTotal, {
    message: "Пересечение не может быть больше числа подписок",
  });
const unavailableSchema = z
  .object({ state: z.literal("unavailable"), observedAt: z.string().datetime(), message })
  .strict();
const incompleteSchema = z
  .object({ state: z.literal("incomplete"), observedAt: z.string().datetime(), message })
  .strict();
const errorSchema = z
  .object({ state: z.literal("error"), observedAt: z.string().datetime(), message })
  .strict();
export const xFollowingOverlapSchema = z.union([
  completeSchema,
  unavailableSchema,
  incompleteSchema,
  errorSchema,
]);
export type XFollowingOverlap = z.infer<typeof xFollowingOverlapSchema>;

const rawPayloadSchema = z
  .object({
    url: z.string().max(2048),
    identity: z.string().max(1000),
    signedOut: z.boolean(),
    followingTotal: z.string().max(200),
    matchedFollowing: z.number().int().nonnegative(),
    complete: z.boolean(),
  })
  .strict();

function parseCount(text: string) {
  const match = /^(\d{1,3}(?:[, \u00a0\u202f]\d{3})+|\d+)\s+/.exec(
    text.trim(),
  );
  const value = match ? Number(match[1].replace(/[, \u00a0\u202f]/g, "")) : NaN;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function parseXFollowingOverlapPayload(
  input: unknown,
  targetHandle: string,
  observedAt: string,
): XFollowingOverlap {
  const raw = rawPayloadSchema.parse(input);
  if (raw.signedOut)
    return { state: "unavailable", observedAt, message: "Войдите в X в приложении." };
  const target = moniHandleSchema.parse(targetHandle);
  let url: URL;
  try {
    url = new URL(raw.url);
  } catch {
    return { state: "error", observedAt, message: "X вернул некорректную страницу." };
  }
  if (
    url.origin !== "https://x.com" ||
    url.pathname.toLowerCase().replace(/\/$/, "") !== `/${target}/followers`
  )
    return { state: "error", observedAt, message: "Страница X изменилась во время чтения." };
  if (!raw.identity.toLowerCase().includes(`@${target}`))
    return { state: "unavailable", observedAt, message: "Профиль токена в X не подтверждён." };
  if (!raw.complete)
    return { state: "incomplete", observedAt, message: "X показал неполный список." };
  const followingTotal = parseCount(raw.followingTotal);
  if (followingTotal === null || raw.matchedFollowing > followingTotal)
    return { state: "incomplete", observedAt, message: "X не подтвердил полный счётчик подписок." };
  return xFollowingOverlapSchema.parse({
    state: "complete",
    targetHandle: target,
    sourceUrl: url.href,
    observedAt,
    followingTotal,
    matchedFollowing: raw.matchedFollowing,
  });
}
