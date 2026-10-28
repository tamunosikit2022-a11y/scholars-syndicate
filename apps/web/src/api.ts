import {
  authConfigResponseSchema,
  healthResponseSchema,
  meResponseSchema,
  signInResponseSchema,
  type AuthConfigResponse,
  type HealthResponse,
  type MeResponse,
  type SignInResponse,
} from '@scholars/shared';

const API_URL = import.meta.env.VITE_API_URL ?? '';

/** The server answered with an error code, e.g. { "error": "account_suspended" }. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** The server could not be reached at all (no internet, server down). */
export class NetworkError extends Error {
  constructor() {
    super('network');
    this.name = 'NetworkError';
  }
}

interface CallOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
}

async function call(path: string, options: CallOptions = {}): Promise<Response> {
  const hasBody = options.body !== undefined;
  try {
    return await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      // Send the sign-in cookie. "include" is only needed when the API lives on another address.
      credentials: API_URL ? 'include' : 'same-origin',
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new NetworkError();
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  let code = 'unknown_error';
  try {
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null && 'error' in body) {
      const value = (body as { error: unknown }).error;
      if (typeof value === 'string') code = value;
    }
  } catch {
    /* the body was not JSON; keep the generic code */
  }
  return new ApiError(code, res.status);
}

/**
 * Asks the API how it is doing. A 503 ("degraded") still carries a valid body,
 * so we validate the body instead of trusting the status code alone.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await call('/api/health', { signal });
  const data: unknown = await res.json();
  return healthResponseSchema.parse(data);
}

export async function getAuthConfig(signal?: AbortSignal): Promise<AuthConfigResponse> {
  const res = await call('/api/auth/config', { signal });
  if (!res.ok) throw await errorFrom(res);
  return authConfigResponseSchema.parse(await res.json());
}

/** Who is signed in on this device. Returns null when nobody is (that is normal, not an error). */
export async function getMe(signal?: AbortSignal): Promise<MeResponse | null> {
  const res = await call('/api/auth/me', { signal });
  if (res.status === 401) return null;
  if (!res.ok) throw await errorFrom(res);
  return meResponseSchema.parse(await res.json());
}

export async function signInWithGoogle(idToken: string): Promise<SignInResponse> {
  const res = await call('/api/auth/google', { method: 'POST', body: { idToken } });
  if (!res.ok) throw await errorFrom(res);
  return signInResponseSchema.parse(await res.json());
}

export async function signOutOnServer(): Promise<void> {
  const res = await call('/api/auth/logout', { method: 'POST' });
  if (!res.ok) throw await errorFrom(res);
}
