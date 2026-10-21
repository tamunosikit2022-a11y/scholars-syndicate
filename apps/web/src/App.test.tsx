import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function respondWith(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

const health = (db: 'up' | 'down') => ({
  status: db === 'up' ? 'ok' : 'degraded',
  db,
  version: '9.9.9',
  time: '2026-01-01T00:00:00.000Z',
});

describe('App', () => {
  it('shows a loading state first', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    render(<App />);
    expect(screen.getByText('Checking the connection…')).toBeTruthy();
  });

  it('shows connected when the API and database are up', async () => {
    vi.stubGlobal('fetch', respondWith(health('up')));
    render(<App />);
    expect(await screen.findByText('Connected — everything is working.')).toBeTruthy();
    expect(screen.getByText('API version 9.9.9')).toBeTruthy();
  });

  it('explains when the database is down (503 still has a body)', async () => {
    vi.stubGlobal('fetch', respondWith(health('down'), 503));
    render(<App />);
    expect(await screen.findByText('Server reachable, but the database is down.')).toBeTruthy();
  });

  it('shows an error when the server cannot be reached, and can retry', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify(health('up')), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(await screen.findByText('Cannot reach the server.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText('Connected — everything is working.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats an unexpected response shape as an error', async () => {
    vi.stubGlobal('fetch', respondWith({ hello: 'world' }));
    render(<App />);
    expect(await screen.findByText('Cannot reach the server.')).toBeTruthy();
  });
});
