import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/use-auth';
import { ProtectedRoute } from '@/components/protected-route';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderRoute(roles?: ('ADMIN' | 'FACULTY' | 'STUDENT')[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/students']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin/students"
              element={
                <ProtectedRoute roles={roles}>
                  <div>Students screen</div>
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<div>Sign in screen</div>} />
            <Route path="/unauthorized" element={<div>Not allowed screen</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('sends a visitor to the sign in screen', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'no session' } }, 401),
    );

    renderRoute(['ADMIN']);

    await waitFor(() => {
      expect(screen.getByText('Sign in screen')).toBeInTheDocument();
    });
  });

  it('renders the page for a user with the right role', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        success: true,
        data: { user: { id: 1, name: 'Ada Administrator', email: 'admin@attendease.test', role: 'ADMIN' } },
      }),
    );

    renderRoute(['ADMIN']);

    await waitFor(() => {
      expect(screen.getByText('Students screen')).toBeInTheDocument();
    });
  });

  it('blocks a user whose role is not allowed', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        success: true,
        data: { user: { id: 2, name: 'Sita Sharma', email: 's1@attendease.test', role: 'STUDENT' } },
      }),
    );

    renderRoute(['ADMIN']);

    await waitFor(() => {
      expect(screen.getByText('Not allowed screen')).toBeInTheDocument();
    });
    expect(screen.queryByText('Students screen')).not.toBeInTheDocument();
  });

  it('lets any signed in user through when no role is required', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        success: true,
        data: { user: { id: 2, name: 'Sita Sharma', email: 's1@attendease.test', role: 'STUDENT' } },
      }),
    );

    renderRoute();

    await waitFor(() => {
      expect(screen.getByText('Students screen')).toBeInTheDocument();
    });
  });
});
