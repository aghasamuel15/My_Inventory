'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabaseClient';
import { getPasswordResetRedirectUrl } from '../lib/authRedirect';
import PasswordInput from './PasswordInput';
import { useTheme } from './ThemeProvider';

const themeOptions = [
  { value: 'light', label: 'Light', description: 'A bright, warm workspace.' },
  { value: 'dark', label: 'Dark', description: 'A softer workspace for low light.' },
  { value: 'system', label: 'System', description: 'Follow your device appearance.' },
];

export default function AccountSettings() {
  const [supabase] = useState(() => createClient());
  const { theme, setTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data, error: userError }) => {
      if (!active) return;
      if (userError) {
        setError(`Could not load account details: ${userError.message}`);
        return;
      }
      setEmail(data.user?.email || '');
    });
    return () => { active = false; };
  }, [supabase]);

  async function changePassword(event) {
    event.preventDefault();
    setError('');
    setPasswordMessage('');
    if (newPassword.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('Your password has been updated.');
    } catch (updateError) {
      setError(updateError.message || 'Could not update your password.');
    } finally {
      setSavingPassword(false);
    }
  }

  async function sendResetEmail() {
    setError('');
    setResetMessage('');
    if (!email) {
      setError('There is no email address on this account to send a password reset link to.');
      return;
    }

    setSendingReset(true);
    try {
      const redirectTo = getPasswordResetRedirectUrl(window.location.origin);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (resetError) throw resetError;
      setResetMessage(`Password reset instructions were sent to ${email}. Check your inbox and spam folder.`);
    } catch (resetError) {
      setError(resetError.message || 'Could not send a password reset email.');
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <section className="card mt-6 space-y-8">
      <div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#927b56]">Personal preferences</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Appearance</h2>
          <p className="mt-1 text-sm text-slate-600">Choose how SME Tracker looks on this device.</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              aria-pressed={theme === option.value}
              className={`rounded-2xl border p-4 text-left transition ${
                theme === option.value
                  ? 'border-[#7a9a83] bg-[#f1f7f1] ring-2 ring-[#176b52]/10'
                  : 'border-slate-200 bg-white hover:border-[#b8c9bd]'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">{option.label}</span>
                <span className={`h-4 w-4 rounded-full border ${theme === option.value ? 'border-[5px] border-[#176b52]' : 'border-slate-300'}`} />
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">{option.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200 pt-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#927b56]">Account security</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">Password</h2>
        <p className="mt-1 text-sm text-slate-600">Update your password or email a secure reset link to {email || 'your account email'}.</p>

        <form onSubmit={changePassword} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="account-new-password">New password</label>
            <PasswordInput
              id="account-new-password"
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="account-confirm-password">Confirm new password</label>
            <PasswordInput
              id="account-confirm-password"
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={savingPassword}>
              {savingPassword ? 'Updating...' : 'Update password'}
            </button>
            <button className="btn-secondary" type="button" onClick={sendResetEmail} disabled={sendingReset || !email}>
              {sendingReset ? 'Sending link...' : 'Email me a reset link'}
            </button>
          </div>
        </form>

        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {passwordMessage && <p role="status" className="mt-4 rounded-xl border border-[#dce8df] bg-[#f1f7f1] px-4 py-3 text-sm text-[#315d48]">{passwordMessage}</p>}
        {resetMessage && (
          <p role="status" className="mt-4 rounded-xl border border-[#dce8df] bg-[#f1f7f1] px-4 py-3 text-sm text-[#315d48]">
            {resetMessage}
          </p>
        )}
      </div>
    </section>
  );
}
