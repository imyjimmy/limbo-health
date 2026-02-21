/**
 * tests/setup/testClient.ts
 *
 * Thin fetch wrapper that prepends the gateway base URL,
 * sets auth headers, and logs failures for debugging.
 */
import { GATEWAY_URL } from './globalSetup';

interface RequestOptions {
  method?: string;
  body?: unknown;
  jwt?: string;
  headers?: Record<string, string>;
}

export interface TypedResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T;
  headers: Headers;
}

/**
 * Make a request through the gateway.
 *
 * @param path  — e.g. `/api/auth/nostr/challenge`
 * @param opts  — method, body, jwt, extra headers
 */
export async function request<T = any>(
  path: string,
  opts: RequestOptions = {},
): Promise<TypedResponse<T>> {
  const { method = 'GET', body, jwt, headers: extraHeaders } = opts;

  const url = `${GATEWAY_URL}${path}`;
  const headers: Record<string, string> = { ...extraHeaders };

  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`;
  }

  if (body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const fetchOpts: RequestInit = { method, headers };

  if (body) {
    fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const res = await fetch(url, fetchOpts);

  let data: T;
  const ct = res.headers.get('content-type') || '';

  if (ct.includes('application/json')) {
    data = (await res.json()) as T;
  } else {
    data = (await res.text()) as unknown as T;
  }

  // Log non-2xx for debugging (except when we expect failure)
  if (!res.ok && process.env.DEBUG_REQUESTS) {
    console.log(
      `  ✗ ${method} ${path} → ${res.status}`,
      typeof data === 'object' ? JSON.stringify(data) : String(data).slice(0, 200),
    );
  }

  return { status: res.status, ok: res.ok, data, headers: res.headers };
}