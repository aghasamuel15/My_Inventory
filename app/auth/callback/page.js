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

function isOtpVerificationType(value) {
  return ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'].includes(value);
}

function isPkceVerifierStorageError(error) {
  const message = error?.message || error?.toString?.() || '';
  return /code verifier.*storage|PKCE.*storage|code_verifier/i.test(message);
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const completionRef = useRef(null);
  const [error, setError] = useState('');
  const [resetFlow, setResetFlow] = useState(false);

  useEffect(() => {
    let active = true;

    const requestUrl = new URL(window.location.href);
    const destination = getSafeNextPath(requestUrl.searchParams.get('next'));
    const isResetFlow = destination === '/reset-password';
    setResetFlow(isResetFlow);

    if (!completionRef.current) {
      completionRef.current = (async () => {
        const errorCode = requestUrl.searchParams.get('error');
        const code = requestUrl.searchParams.get('code');
        const flowId = requestUrl.searchParams.get('sb_flow_id');
        const tokenHash = requestUrl.searchParams.get('token_hash');
        const otpType = requestUrl.searchParams.get('type') || (isResetFlow ? 'recovery' : '');

        if (errorCode) {
          throw new Error('This link is invalid or has expired. Request a new link to continue.');
        }

        const supabase = createClient();

        const verifyOtpToken = async () => {
          if (!tokenHash || !isOtpVerificationType(otpType)) {
            return false;
          }

          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });

          if (verifyError) {
            throw verifyError;
          }

          return true;
        };

        if (code) {
          try {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
              code,
              flowId ? { flowId } : undefined
            );
            if (exchangeError) {
              if (isPkceVerifierStorageError(exchangeError) && tokenHash) {
                await verifyOtpToken();
              } else {
                throw exchangeError;
              }
            }
          } catch (exchangeError) {
            if (isPkceVerifierStorageError(exchangeError) && tokenHash) {
              await verifyOtpToken();
            } else {
              throw exchangeError;
            }
          }
        } else if (tokenHash && isOtpVerificationType(otpType)) {
          await verifyOtpToken();
        } else {
          const hashParams = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash);
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken && refreshToken) {
            const { data, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            if (!data.session) {
              throw new Error('This link is invalid or has expired. Request a new link to continue.');
            }
          } else {
            const { data, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            if (!data.session) {
              throw new Error('This link is invalid or has expired. Request a new link to continue.');
            }
          }
        }

        if (window.location.hash) {
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
        }

        return destination;
      })();
    }

    completionRef.current
      .then((safeDestination) => {
        if (!active) return;
        router.replace(safeDestination);
        router.refresh();
      })
      .catch((authError) => {
        if (active) {
          const friendlyMessage = isPkceVerifierStorageError(authError)
            ? 'PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on both the server and client to store the code verifier in cookies.'
            : authError.message || 'Could not verify this link. Request a new one to continue.';
          setError(friendlyMessage);
        }
      });

    return () => { active = false; };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#102821] px-4 py-8">
      <section className="w-full max-w-[46rem] rounded-[2rem] border border-[#2f3d38] bg-[#12302b]/95 p-6 shadow-[0_24px_70px_rgba(0,0,0,0.28)] sm:p-8 lg:p-10">
        {error ? (
          <>
            <h1 className="text-center text-[clamp(2.5rem,4vw,4rem)] font-semibold tracking-[-0.06em] text-[#f3f4ef]">
              Link could not be verified
            </h1>
            <p role="alert" className="mx-auto mt-6 max-w-[44rem] text-center text-[1.15rem] leading-[1.7] text-[#e9ece7]">
              {error}
            </p>
            <div className="mt-8 flex flex-col gap-4">
              {resetFlow && (
                <Link href="/forgot-password" className="inline-flex items-center justify-center rounded-2xl bg-[#1f6a5d] px-8 py-5 text-[1.7rem] font-semibold leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition hover:bg-[#2a7c6b]">
                  Request a new reset link
                </Link>
              )}
              <Link href="/login" className="inline-flex items-center justify-center rounded-2xl border border-[#415a53] bg-[#1c2d2a] px-8 py-5 text-[1.7rem] font-semibold leading-none text-white transition hover:bg-[#243a36]">
                Back to sign in
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-center text-[clamp(2.5rem,4vw,4rem)] font-semibold tracking-[-0.06em] text-[#f5f6f2]">
              Verifying your secure link
            </h1>
            <p role="status" className="mt-6 text-center text-[1.05rem] text-[#dfe5df]">
              Please wait while we verify your link…
            </p>
          </>
        )}
      </section>
    </main>
  );
}
