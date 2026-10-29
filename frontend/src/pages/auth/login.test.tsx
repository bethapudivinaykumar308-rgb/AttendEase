import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/use-auth';
import { ToastProvider } from '@/hooks/use-toast';
import LoginPage from '@/pages/auth/login';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderLogin() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/login']}>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/admin" element={<div>Administrator dashboard</div>} />
              <Route path="/faculty" element={<div>Faculty dashboard</div>} />
              <Route path="/student" element={<div>Student dashboard</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('Login page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, data: { user: null } }));
  });

  it('renders the sign in form', async () => {
    renderLogin();

    expect(await screen.findByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('validates the email address before calling the server', async () => {
    const user = userEvent.setup();
    renderLogin();

    await screen.findByLabelText('Email address');
    await user.type(screen.getByLabelText('Email address'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'Password@123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    const loginCalls = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).includes('/api/auth/login'));
    expect(loginCalls).toHaveLength(0);
  });

  it('requires a password', async () => {
    const user = userEvent.setup();
    renderLogin();

    await screen.findByLabelText('Email address');
    await user.type(screen.getByLabelText('Email address'), 'admin@attendease.test');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Password is required')).toBeInTheDocument();
  });

  it('shows the message returned by the server for invalid credentials', async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/login')) {
        return Promise.resolve(
          jsonResponse(
            {
              success: false,
              error: { code: 'UNAUTHORIZED', message: 'Incorrect email or password' },
            },
            401,
          ),
        );
      }
      return Promise.resolve(
        jsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'no session' } }, 401),
      );
    });

    const user = userEvent.setup();
    renderLogin();

    await screen.findByLabelText('Email address');
    await user.type(screen.getByLabelText('Email address'), 'admin@attendease.test');
    await user.type(screen.getByLabelText('Password'), 'WrongPass@123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Incorrect email or password');
  });

  it('lands the administrator on the administrator dashboard', async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/login')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: { user: { id: 1, name: 'Ada Administrator', email: 'admin@attendease.test', role: 'ADMIN' } },
          }),
        );
      }
      return Promise.resolve(jsonResponse({ success: true, data: { user: null } }));
    });

    const user = userEvent.setup();
    renderLogin();

    await screen.findByLabelText('Email address');
    await user.type(screen.getByLabelText('Email address'), 'admin@attendease.test');
    await user.type(screen.getByLabelText('Password'), 'Password@123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Administrator dashboard')).toBeInTheDocument();
    });
  });

  it('toggles the visibility of the password', async () => {
    const user = userEvent.setup();
    renderLogin();

    const password = await screen.findByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
  });
});
