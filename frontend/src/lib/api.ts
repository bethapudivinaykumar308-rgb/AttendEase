const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  raw?: boolean;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Thin fetch wrapper that always sends the session cookie, attaches the
 * double-submit CSRF token to mutating requests, and normalises API errors.
 */
export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, raw, query, headers, ...rest } = options;
  const method = (rest.method ?? 'GET').toUpperCase();
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);

  const finalHeaders = new Headers(headers);
  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders.set('Content-Type', 'application/json');
  }
  if (isMutation) {
    const csrf = readCookie('attendease_csrf');
    if (csrf) finalHeaders.set('X-CSRF-Token', csrf);
  }

  const response = await fetch(buildUrl(path, query), {
    ...rest,
    method,
    credentials: 'include',
    headers: finalHeaders,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });

  if (raw) {
    if (!response.ok) {
      throw new ApiError(response.status, `Request failed with status ${response.status}`);
    }
    return response as unknown as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      throw new ApiError(response.status, `Request failed with status ${response.status}`);
    }
    return (await response.text()) as unknown as T;
  }

  const payload = await response.json();

  if (!response.ok || payload?.success === false) {
    const error = payload?.error ?? {};
    throw new ApiError(
      response.status,
      error.message ?? 'Something went wrong. Please try again.',
      error.code ?? 'ERROR',
      error.details,
    );
  }

  return payload.data as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => apiRequest<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
  raw: (path: string, query?: RequestOptions['query']) =>
    apiRequest<Response>(path, { method: 'GET', query, raw: true }),
};

/** Downloads a CSV export and triggers a browser download. */
export async function downloadCsv(path: string, query?: RequestOptions['query'], filename?: string) {
  const response = await api.raw(path, query);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const disposition = response.headers.get('content-disposition');
  const match = disposition?.match(/filename="?([^"]+)"?/);
  const name = filename ?? match?.[1] ?? 'export.csv';

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** Wraps a paginated endpoint and returns both the rows and the meta block. */
export async function fetchPaginated<T>(
  path: string,
  query?: RequestOptions['query'],
): Promise<{ data: T[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }> {
  const response = await fetch(buildUrl(path, query), { credentials: 'include' });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      payload?.error?.message ?? 'Failed to load data',
      payload?.error?.code,
    );
  }
  const payload = await response.json();
  return { data: payload.data ?? [], meta: payload.meta };
}
