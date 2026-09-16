import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, DELETE } from '@/app/api/seller-session/route';
import { syncSellerSession } from './seller-session';

afterEach(() => vi.unstubAllGlobals());

describe('seller session', () => {
  it('checks the API role before setting a private cookie and rejects cross-origin requests', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ roles: ['CUSTOMER'] })));
    vi.stubGlobal('fetch', fetch);
    const request = () => new NextRequest('https://veloura.test/api/seller-session', { method: 'POST', headers: { origin: 'https://veloura.test', authorization: 'Bearer valid-token' } });
    expect((await POST(request())).status).toBe(403);
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ roles: ['SELLER'] })));
    const response = await POST(request());
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('Secure');
    expect((await POST(new NextRequest('https://veloura.test/api/seller-session', { method: 'POST', headers: { origin: 'https://evil.test', authorization: 'Bearer valid-token' } }))).status).toBe(403);
    expect(fetch).toHaveBeenCalledTimes(2);
    const deleted = await DELETE(new NextRequest('https://veloura.test/api/seller-session', { method: 'DELETE', headers: { origin: 'https://veloura.test' } }));
    expect(deleted.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970');
    const alias = await DELETE(new NextRequest('http://localhost:3110/api/seller-session', { method: 'DELETE', headers: { host: '127.0.0.1:3110', origin: 'http://127.0.0.1:3110' } }));
    expect(alias.status).toBe(204);
  });

  it('finishes an in-flight renewal before clearing the cookie on logout', async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; })).mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    const renewal = syncSellerSession('fresh-token');
    const logout = syncSellerSession(null);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    finish(new Response(null, { status: 204 }));
    await Promise.all([renewal, logout]);
    expect(fetch.mock.calls.map((call) => call[1].method)).toEqual(['POST', 'DELETE']);
  });
});
