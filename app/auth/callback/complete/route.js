import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';

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

function getCallbackUrl(requestUrl, nextPath, error) {
  const callbackUrl = new URL('/auth/callback', requestUrl);
  callbackUrl.searchParams.set('next', nextPath);
  if (error) callbackUrl.searchParams.set('error', error);
  return callbackUrl;
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const nextPath = getSafeNextPath(requestUrl.searchParams.get('next'));
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  const flowId = requestUrl.searchParams.get('sb_flow_id');

  if (!code && !(tokenHash && type === 'recovery')) {
    return NextResponse.redirect(getCallbackUrl(requestUrl, nextPath, 'missing_code'));
  }

  const supabase = createServerSupabaseClient();
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });

  if (error) {
    return NextResponse.redirect(getCallbackUrl(requestUrl, nextPath, 'verification_failed'));
  }

  return NextResponse.redirect(new URL(nextPath, requestUrl));
}
