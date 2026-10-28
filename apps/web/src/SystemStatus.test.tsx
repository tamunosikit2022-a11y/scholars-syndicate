import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemStatus } from './SystemStatus';
import { fakeServer, health, json } from './testUtils';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SystemStatus', () => {
  it('shows a loading state first', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    render(<SystemStatus />);
    expect(screen.getByText('Checking the connection…')).toBeTruthy();
  });

  it('shows connected when the API and database are up', async () => {
    fakeServer({ 'GET /api/health': () => json(health('up')) });
    render(<SystemStatus />);
    expect(await screen.findByText('Connected — everything is working.')).toBeTruthy();
    expect(screen.getByText('API version 9.9.9')).toBeTruthy();
  });

  it('explains when the database is down (503 still has a body)', async () => {
    fakeServer({ 'GET /api/health': () => json(health('down'), 503) });
    render(<SystemStatus />);
    expect(await screen.findByText('Server reachable, but the database is down.')).toBeTruthy();
  });

  it('shows an error when the server cannot be reached, and can retry', async () => {
    let calls = 0;
    fakeServer({
      'GET /api/health': () => {
        calls += 1;
        if (calls === 1) throw new TypeError('Failed to fetch');
        return json(health('up'));
      },
    });
    render(<SystemStatus />);
    expect(await screen.findByText('Cannot reach the server.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText('Connected — everything is working.')).toBeTruthy();
    expect(calls).toBe(2);
  });

  it('treats an unexpected response shape as an error', async () => {
    fakeServer({ 'GET /api/health': () => json({ hello: 'world' }) });
    render(<SystemStatus />);
    expect(await screen.findByText('Cannot reach the server.')).toBeTruthy();
  });
});
