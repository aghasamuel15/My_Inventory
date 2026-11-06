import Link from 'next/link';

export default function InvitationPage({ searchParams }) {
  const email = typeof searchParams?.email === 'string' ? searchParams.email.trim() : '';
  const isPending = searchParams?.mode !== 'login';
  const encodedEmail = encodeURIComponent(email);
  const signupHref = email ? `/signup?email=${encodedEmail}` : '/signup';
  const loginHref = email ? `/login?email=${encodedEmail}` : '/login';
  const primaryHref = isPending ? signupHref : loginHref;
  const primaryLabel = isPending ? 'Create account' : 'Sign in to account';
  const secondaryHref = isPending ? loginHref : signupHref;
  const secondaryLabel = isPending ? 'I already have an account' : 'I need to create an account';

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-lg sm:p-8">
        <div className="text-2xl font-black text-brand-700">SME Tracker</div>
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Business invitation</p>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">
          {isPending ? 'You’re invited to join a business' : 'You’ve been added to a business'}
        </h1>
        {email ? (
          <p className="mt-3 break-all text-sm text-slate-600">
            Continue with <span className="font-semibold text-slate-800">{email}</span>.
          </p>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            Continue by creating an account or signing in with the email address that received the invitation.
          </p>
        )}
        <div className="mt-6 grid gap-3">
          <Link href={primaryHref} className="btn-primary block w-full">
            {primaryLabel}
          </Link>
          <Link href={secondaryHref} className="btn-secondary block w-full">
            {secondaryLabel}
          </Link>
        </div>
        <p className="mt-5 text-xs leading-5 text-slate-500">
          Use the invited email address so the business can match your account to its invitation. Admin access is reserved for the business’s first account.
        </p>
      </section>
    </main>
  );
}
