import { z } from "zod";
const n = z.number().finite().nonnegative();
export const xPostSchema = z.object({
  id: z.string(),
  text: z.string(),
  authorId: z.string().optional(),
  username: z.string().optional(),
  createdAt: z.string().optional(),
  url: z.string().url(),
  warningTerms: z.array(z.string()),
});
export const xProfileSchema = z.object({
  username: z.string(),
  url: z.string().url(),
  discoveredFrom: z.string().url(),
  id: z.string().optional(),
  description: z.string().optional(),
  createdAt: z.string().optional(),
  followers: n.int().optional(),
  identity: z.enum(["MINT_MATCH", "NOT_CONFIRMED"]),
  mintInBio: z.boolean(),
  mintInPosts: z.boolean(),
  timelineComplete: z.boolean(),
  pages: n.int(),
  start: z.string(),
  end: z.string(),
  observed7d: n.int().optional(),
  observed30d: n.int().optional(),
  posts: z.array(xPostSchema),
  error: z.string().optional(),
  notes: z.array(z.string()),
});
export const poolSchema = z.object({
  address: z.string(),
  dex: z.string(),
  name: z.string(),
  baseMint: z.string(),
  quoteMint: z.string(),
  liquidityUsd: n.optional(),
  volume24h: n.optional(),
  priceUsd: n.optional(),
  createdAt: z.number().optional(),
  binStep: n.optional(),
  baseFeePct: n.optional(),
  dynamicFeePct: n.optional(),
  priceYPerX: n.optional(),
});
export const liveDetailsSchema = z.object({
  holderCount: n.int().optional(),
  marketCapUsd: n.optional(),
  socialLinks: z.array(z.string().url()).optional(),
  xProfiles: z.array(xProfileSchema).optional(),
  metrics: z
    .array(
      z.object({
        label: z.string(),
        value: z.number().finite(),
        unit: z.string(),
      }),
    )
    .optional(),
  wallets: z
    .array(
      z.object({
        address: z.string(),
        pct: n.max(100).optional(),
        tags: z.array(z.string()),
        realizedUsd: z.number().finite().optional(),
        unrealizedUsd: z.number().finite().optional(),
        transferred: z.boolean().optional(),
      }),
    )
    .optional(),
  clusters: z
    .array(
      z.object({
        shareRaw: n,
        holders: z.array(z.string()),
        holderCount: n.int(),
      }),
    )
    .optional(),
  sourceUpdatedAt: z.string().optional(),
  social: z
    .object({
      periodDays: n,
      start: z.string(),
      end: z.string(),
      complete: z.boolean(),
      pages: n,
      query: z.string(),
      posts: z.array(
        z.object({
          id: z.string(),
          text: z.string(),
          authorId: z.string().optional(),
          username: z.string().optional(),
          createdAt: z.string().optional(),
          url: z.string().url(),
          warningTerms: z.array(z.string()),
        }),
      ),
    })
    .optional(),
  identity: z
    .object({
      mint: z.string(),
      name: z.string().optional(),
      symbol: z.string().optional(),
      decimals: n.optional(),
      supplyRaw: z.string().optional(),
      mintAuthority: z.string().nullable().optional(),
      freezeAuthority: z.string().nullable().optional(),
    })
    .optional(),
  pools: z.array(poolSchema).optional(),
  holders: z
    .array(
      z.object({
        address: z.string(),
        amountRaw: z.string(),
        owner: z.string().optional(),
        pct: n.max(100).optional(),
      }),
    )
    .optional(),
  risks: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        level: z.string(),
      }),
    )
    .optional(),
  notes: z.array(z.string()),
});
export type LiveDetails = z.infer<typeof liveDetailsSchema>;
export type Pool = z.infer<typeof poolSchema>;
