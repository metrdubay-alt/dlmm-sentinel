/** Contracts only: no network implementation or credentials in Phase 1–2. */
export interface ProviderResult<T> {
  providerId: string;
  status: "success" | "partial" | "unavailable" | "error";
  data?: T;
  fetchedAt: string;
  expiresAt?: string;
  sourceUrls: string[];
  rawResponse?: unknown;
  error?: { code: string; message: string };
}
export interface SocialEvidence {
  mint: string;
  evidenceId: string;
  classification:
    | "verified-fact"
    | "credible-evidence"
    | "unverified-claim"
    | "rumor"
    | "unavailable";
  exactMintMention: boolean;
  officialAccountConfidence: number;
  sourceUrl?: string;
  observedAt: string;
}
export interface LiveSocialAdapter {
  readonly enabled: false;
  searchMint(
    mint: string,
    signal: AbortSignal,
  ): Promise<ProviderResult<SocialEvidence[]>>;
}
export interface NotificationSink {
  notify(alert: {
    id: string;
    title: string;
    message: string;
    localReportId: string;
  }): Promise<void>;
}
