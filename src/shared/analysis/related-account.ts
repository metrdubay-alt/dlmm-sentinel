import { z } from "zod";
import { moniHandleSchema } from "./moni";
export const relatedAccountSchema = z
  .object({
    handle: moniHandleSchema,
    role: z.enum([
      "creator",
      "team",
      "fee_recipient",
      "narrative",
      "source_link",
    ]),
    source: z
      .string()
      .url()
      .max(2048)
      .refine((value) => {
        const u = new URL(value);
        return u.protocol === "https:" && !u.username && !u.password;
      }),
    attribution: z.enum(["grok", "reviewed", "gmgn"]).optional(),
  })
  .strict();
export const relatedRoleLabels = {
  creator: "Создатель токена",
  team: "Команда",
  fee_recipient: "Получатель комиссий",
  narrative: "Связан с нарративом",
  source_link: "Профиль из карточки GMGN",
};
export function mergeRelatedAccounts(
  saved: z.infer<typeof relatedAccountSchema>[] = [],
  discovered: z.infer<typeof relatedAccountSchema>[] = [],
) {
  const rows = new Map(
    saved
      .filter((a) => a.attribution !== "grok")
      .map((a) => [`${a.handle}:${a.role}`, a]),
  );
  for (const a of discovered) {
    const key = `${a.handle}:${a.role}`;
    if (rows.get(key)?.attribution !== "reviewed")
      rows.set(key, { ...a, attribution: "grok" });
  }
  return [...rows.values()].slice(0, 5);
}
