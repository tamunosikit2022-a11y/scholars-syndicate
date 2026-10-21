import { healthResponseSchema, type HealthResponse } from '@scholars/shared';

const API_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Asks the API how it is doing. A 503 ("degraded") still carries a valid body,
 * so we validate the body instead of trusting the status code alone.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/api/health`, { signal });
  const data: unknown = await res.json();
  return healthResponseSchema.parse(data);
}
