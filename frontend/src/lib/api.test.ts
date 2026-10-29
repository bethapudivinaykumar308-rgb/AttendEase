import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, apiRequest } from '@/lib/api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('API client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns the data block of a successful response', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, data: { id: 7 } }));

    const result = await api.get<{ id: number }>('/api/students/7');

    expect(result).toEqual({ id: 7 });
  });

  it('always sends the session cookie', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, data: [] }));

    await api.get('/api/students');

    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect((options as RequestInit).credentials).toBe('include');
  });

  it('attaches the CSRF token to mutating requests', async () => {
    document.cookie = 'attendease_csrf=csrf-token-value';
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, data: {} }));

    await api.post('/api/students', { name: 'Test' });

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const headers = (options as RequestInit).headers as Headers;
    expect(headers.get('X-CSRF-Token')).toBe('csrf-token-value');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('never sends the CSRF token on a safe request', async () => {
    document.cookie = 'attendease_csrf=csrf-token-value';
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, data: {} }));

    await api.get('/api/students');

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const headers = (options as RequestInit).headers as Headers;
    expect(headers.get('X-CSRF-Token')).toBeNull();
  });

  it('builds the query string and drops empty values', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, data: [] }));

    await api.get('/api/students', { page: 2, search: 'sita', departmentId: undefined, empty: '' });

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/api/students?page=2&search=sita');
  });

  it('turns an error payload into an ApiError', async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'The submitted data is invalid' },
          },
          422,
        ),
      ),
    );

    await expect(api.post('/api/students', {})).rejects.toBeInstanceOf(ApiError);

    try {
      await api.post('/api/students', {});
      expect.unreachable('the request should have failed');
    } catch (error) {
      const apiError = error as ApiError;
      expect(apiError.status).toBe(422);
      expect(apiError.code).toBe('VALIDATION_ERROR');
      expect(apiError.message).toBe('The submitted data is invalid');
    }
  });

  it('never leaks a stack trace in the error message', async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(
        jsonResponse({ success: false, error: { code: 'X', message: 'Something broke' } }, 500),
      ),
    );

    try {
      await apiRequest('/api/students');
      expect.unreachable('the request should have failed');
    } catch (error) {
      expect((error as ApiError).message).toBe('Something broke');
      expect((error as ApiError).message).not.toContain('at ');
    }
  });
});
