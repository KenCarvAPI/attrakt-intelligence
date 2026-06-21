import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, isValidSession } from '@/lib/auth';

// Paths that never require auth.
const PUBLIC = ['/login', '/api/auth'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const authed = await isValidSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (authed) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('from', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
