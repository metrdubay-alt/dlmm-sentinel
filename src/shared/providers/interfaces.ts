import type { ProviderId, Scenario, Snapshot } from "../schemas/domain";
export interface ProviderAdapter<TInput, TOutput> {
  id: ProviderId;
  displayName: string;
  isConfigured(): boolean;
  isAvailable(): Promise<boolean>;
  fetch(input: TInput): Promise<TOutput>;
}
export type DemoInput = { mint: string; scenario: Scenario; now: string };
export type DemoAdapter = ProviderAdapter<DemoInput, Snapshot>;
/** Future live adapters must normalize and validate before returning. No live implementation in Phase 1–2. */
export interface FutureLiveProvider {
  id: string;
  enabled: false;
  configureInMainProcess(secretReference: string): Promise<void>;
}
