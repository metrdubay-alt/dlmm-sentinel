import { z } from "zod";
export const sourceIdSchema = z.enum(["gmgn", "x", "moni", "grok"]);
export type SourceId = z.infer<typeof sourceIdSchema>;
export const moniUsageSchema = z.object({
  dailyUsedPercent: z.number().min(0).max(100).nullable(),
  weeklyUsedPercent: z.number().min(0).max(100).nullable(),
});
export const grokQuotaSchema = z.object({
  remaining: z.number().int().nonnegative().nullable(),
  total: z.number().int().positive().nullable(),
  usedPercent: z.number().min(0).max(100).nullable(),
  reset: z.string().trim().min(1).max(160).nullable(),
}).superRefine((quota, context) => {
  if ((quota.remaining === null) !== (quota.total === null)) {
    context.addIssue({ code: "custom", message: "Count quota must have both values." });
  }
  if (quota.remaining === null && quota.usedPercent === null) {
    context.addIssue({ code: "custom", message: "Quota needs a count or percentage." });
  }
});
export const connectionSchema = z.object({
  auth: z.enum(["signed-in", "signed-out", "unknown"]),
  open: z.boolean(),
  checkedAt: z.string().datetime().nullable(),
  limit: z.string().nullable(),
  usage: moniUsageSchema.nullable().optional(),
  grokQuota: grokQuotaSchema.nullable().optional(),
  challenge: z.boolean(),
});
export type Connection = z.infer<typeof connectionSchema>;
export const connectionsSchema = z.object({
  gmgn: connectionSchema,
  x: connectionSchema,
  moni: connectionSchema,
  grok: connectionSchema,
});
export const unknownConnection = (): Connection => ({
  auth: "unknown",
  open: false,
  checkedAt: null,
  limit: null,
  challenge: false,
});
export type ConnectionEvidence = {
  signedIn: boolean;
  signedOut: boolean;
  notice: string;
  usage?: z.infer<typeof moniUsageSchema> | null;
  grokQuotaText?: string;
  challenge: boolean;
};
export function parseGrokQuota(text: string) {
  const match = /(\d+)\s*(?:of|\/)\s*(\d+)\s*(?:messages?|requests?|queries)\s*(?:left|remaining)/i.exec(text);
  const reset = /(resets?[^\n·]{0,120})/i.exec(text)?.[1]?.trim() ?? null;
  if (match) {
    const remaining = Number(match[1]), total = Number(match[2]);
    if (!Number.isSafeInteger(remaining) || !Number.isSafeInteger(total) || remaining < 0 || total <= 0 || remaining > total) return null;
    return grokQuotaSchema.parse({ remaining, total, usedPercent: null, reset });
  }
  const percentage = /(?:usage|used|limit|quota)[^\n·%]{0,80}?(\d{1,3}(?:\.\d+)?)\s*%/i.exec(text);
  if (!percentage) return null;
  const usedPercent = Number(percentage[1]);
  if (!Number.isFinite(usedPercent) || usedPercent < 0 || usedPercent > 100) return null;
  return grokQuotaSchema.parse({ remaining: null, total: null, usedPercent, reset });
}
export function connectionFromEvidence(e: ConnectionEvidence): Connection {
  const limited =
    /(?:reached|hit|exceeded|exhausted).{0,60}(?:limit|quota)|(?:limit|quota).{0,60}(?:reached|exceeded|exhausted)|too many requests|rate.limit|(?:лимит|квота).{0,50}(?:исчерпан|достигнут)|(?:исчерпан|достигнут).{0,50}(?:лимит|квота)|(?<![\d.])0\s*(?:of\s*\d+\s*)?(?:requests|checks|searches|credits)\s*(?:left|remaining)/i.test(
      e.notice,
    );
  const usage = moniUsageSchema.safeParse(e.usage);
  const confirmed = usage.success ? usage.data : null;
  const grokQuota = parseGrokQuota(e.grokQuotaText ?? "");
  const exhausted =
    confirmed?.dailyUsedPercent === 100
      ? "Дневной лимит GetMoni исчерпан."
      : confirmed?.weeklyUsedPercent === 100
        ? "Недельный лимит GetMoni исчерпан."
        : null;
  return {
    usage: confirmed,
    grokQuota,
    auth: e.signedOut ? "signed-out" : e.signedIn ? "signed-in" : "unknown",
    open: true,
    checkedAt: new Date().toISOString(),
    limit:
      exhausted ??
      (limited ? "Лимит исчерпан. Повторите после сброса квоты." : null),
    challenge: e.challenge,
  };
}
