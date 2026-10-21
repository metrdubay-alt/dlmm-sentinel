export const GROK_RESPONSE_TIMEOUT_MS = 8 * 60_000;

export function grokResponseDeadline(submittedAt: number) {
  return submittedAt + GROK_RESPONSE_TIMEOUT_MS;
}
