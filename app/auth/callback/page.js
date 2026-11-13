'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '../../../lib/supabaseClient';

function getSafeNextPath(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }

  const destination = new URL(value, window.location.origin);
  if (destination.origin !== window.location.origin) {
    return '/dashboard';
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState('');
  const [resetFlow, setResetFlow] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let active = true;

    async function completeAuth() {
      try {
        const requestUrl = new URL(window.location.href);
        const destination = getSafeNextPath(requestUrl.searchParams.get('next'));
        const isResetFlow = destination === '/reset-password';
        const errorCode = requestUrl.searchParams.get('error');
        const code = requestUrl.searchParams.get('code');
        const flowId = requestUrl.searchParams.get('sb_flow_id');
        const tokenHash = requestUrl.searchParams.get('token_hash');
        const otpType = requestUrl.searchParams.get('type')
          || (isResetFlow ? 'recovery' : '');

        if (active) setResetFlow(isResetFlow);
        if (errorCode) {
          throw new Error('This link is invalid or has expired. Request a new link to continue.');
        }

        const supabase = createClient();
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
            code,
            flowId ? { flowId } : undefined
          );
          if (exchangeError) throw exchangeError;
        } else if (tokenHash && ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'].includes(otpType)) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });
          if (verifyError) throw verifyError;
        } else {
          const { data, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;
          if (!data.session) {
            throw new Error('This link is invalid or has expired. Request a new link to continue.');
          }
        }

        if (active) {
          router.replace(destination);
          router.refresh();
        }
      } catch (authError) {
        if (active) {
          setError(authError.message || 'Could not verify this link. Request a new one to continue.');
        }
      }
    }

    completeAuth();
    return () => { active = false; };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f5f0] px-4 py-8">
      <section className="w-full max-w-md rounded-[28px] border border-[#e1e8df] bg-white p-6 shadow-[0_28px_80px_rgba(27,56,41,0.12)] sm:p-9">
        <h1 className="text-2xl font-semibold text-[#20372c]">
          {error ? 'Link could not be verified' : 'Verifying your secure link'}
        </h1>
        {error ? (
          <>
            <p role="alert" className="mt-4 text-sm leading-6 text-red-700">{error}</p>
            <div className="mt-6 flex flex-col gap-3">
              {resetFlow && (
                <Link href="/forgot-password" className="btn-primary text-center">
                  Request a new reset link
                </Link>
              )}
              <Link href="/login" className="btn-secondary text-center">Back to sign in</Link>
            </div>
          </>
        ) : (
          <p role="status" className="mt-4 text-sm text-[#738078]">
            Please wait while we verify your link…
          </p>
        )}
      </section>
    </main>
  );
}
