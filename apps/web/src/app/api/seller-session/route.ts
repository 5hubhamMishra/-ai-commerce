import { NextRequest, NextResponse } from 'next/server';
import { readSellerSession, SELLER_COOKIE } from '@/lib/seller-session';

function sameOrigin(request: NextRequest) {
  return request.headers.get('origin') === `${request.nextUrl.protocol}//${request.headers.get('host') ?? request.nextUrl.host}`;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
  if (!token || token.length > 3500 || !await readSellerSession(token)) return new Response(null, { status: 403 });
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(SELLER_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: request.nextUrl.protocol === 'https:', path: '/', maxAge: 900 });
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete(SELLER_COOKIE);
  return response;
}
