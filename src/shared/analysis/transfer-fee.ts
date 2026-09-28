import { z } from "zod";
export const transferFeeSchema = z
  .object({
    status: z.enum(["configured", "none", "unknown"]),
    observedAt: z.string().datetime(),
    source: z.string().max(100),
    sourceUrl: z.string().url().optional(),
    percent: z.number().min(0).max(100).optional(),
    maximumTokens: z.string().max(300).optional(),
    nextPercent: z.number().min(0).max(100).optional(),
    nextEpoch: z.number().int().nonnegative().optional(),
    stale: z.boolean().optional(),
    canChange: z.boolean().optional(),
    reason: z.string().max(300).optional(),
  })
  .strict();
export type TransferFee = z.infer<typeof transferFeeSchema>;
