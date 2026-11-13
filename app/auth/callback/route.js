import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

function getSafeNextPath(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }

  const destination = new URL(value, 'http://localhost');
  if (destination.origin !== 'http://localhost') {
    return '/dashboard';
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const flowId = requestUrl.searchParams.get('sb_flow_id');
  const destination = new URL(getSafeNextPath(requestUrl.searchParams.get('next')), request.url);
  const errorDestination = destination.pathname === '/reset-password'
    ? new URL('/reset-password?error=invalid_link', request.url)
    : new URL('/login?error=confirmation', request.url);
  let response = NextResponse.redirect(destination);

  if (!code) {
    return NextResponse.redirect(errorDestination);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.redirect(destination);
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(
    code,
    flowId ? { flowId } : undefined
  );
  if (error) {
    return NextResponse.redirect(errorDestination);
  }

  return response;
}
