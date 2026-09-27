import { z } from "zod";
export const sourceIdSchema = z.enum(["gmgn", "x", "moni", "grok"]);
export type SourceId = z.infer<typeof sourceIdSchema>;
export const connectionSchema = z.object({
  auth: z.enum(["signed-in", "signed-out", "unknown"]),
  open: z.boolean(),
  checkedAt: z.string().datetime().nullable(),
  limit: z.string().nullable(),
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
  challenge: boolean;
};
export function connectionFromEvidence(e: ConnectionEvidence): Connection {
  const limited =
    /(?:reached|hit|exceeded|exhausted).{0,60}(?:limit|quota)|(?:limit|quota).{0,60}(?:reached|exceeded|exhausted)|too many requests|rate.limit|(?:лимит|квота).{0,50}(?:исчерпан|достигнут)|(?:исчерпан|достигнут).{0,50}(?:лимит|квота)|0\s*(?:of\s*\d+\s*)?(?:requests|checks|searches|credits)\s*(?:left|remaining)/i.test(
      e.notice,
    );
  return {
    auth: e.signedOut ? "signed-out" : e.signedIn ? "signed-in" : "unknown",
    open: true,
    checkedAt: new Date().toISOString(),
    limit: limited ? "Лимит исчерпан. Повторите после сброса квоты." : null,
    challenge: e.challenge,
  };
}
