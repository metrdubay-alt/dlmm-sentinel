import {
  snapshotSchema,
  providerIds,
  type ProviderId,
  type Settings,
  type Snapshot,
} from "../schemas/domain";
import type { DemoAdapter, DemoInput } from "./interfaces";
import { fixtureFacts } from "./mock/fixtures";
export const providerLabels: Record<ProviderId, string> = {
  chain: "Solana RPC · макет",
  holders: "Холдеры · макет",
  market: "Рынок · макет",
  scanner: "Risk scanner · макет",
  social: "X / Social · макет",
  url: "Проверка URL · макет",
  legitimacy: "Проект · макет",
  timing: "События · макет",
};
export function createMockAdapter(
  id: ProviderId,
  settings: Settings,
): DemoAdapter {
  return {
    id,
    displayName: providerLabels[id],
    isConfigured: () => true,
    isAvailable: async () => true,
    async fetch(input: DemoInput) {
      const data = settings.providers[id]
        ? fixtureFacts(input.scenario)[id]
        : undefined;
      const ttl = settings.thresholds[`${id}FreshMinutes`];
      return snapshotSchema.parse({
        providerId: id,
        displayName: providerLabels[id],
        status: data ? "success" : "unavailable",
        data,
        fetchedAt: input.now,
        expiresAt: new Date(Date.parse(input.now) + ttl * 60000).toISOString(),
        sourceUrls: [],
        rawResponse: data
          ? { fixture: input.scenario, synthetic: true, payload: data }
          : undefined,
        error: data
          ? undefined
          : {
              code: "DEMO_UNAVAILABLE",
              message: `Данные недоступны: ${providerLabels[id]}`,
            },
        sourceType: "mock",
        evidenceId: `demo:${input.scenario}:${id}`,
        confidence: data ? 100 : 0,
        stale: false,
      });
    },
  };
}
export async function fetchDemoSnapshots(
  input: DemoInput,
  settings: Settings,
): Promise<Snapshot[]> {
  return Promise.all(
    providerIds.map((id) => createMockAdapter(id, settings).fetch(input)),
  );
}
