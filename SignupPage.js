"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../lib/supabaseClient";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { business_name: businessName } },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="card max-w-md text-center">
          <h1 className="text-xl font-bold mb-2">Check your email</h1>
          <p className="text-gray-600 text-sm">
            We sent a confirmation link to <strong>{email}</strong>. Confirm your
            email, then log in to get started.
          </p>
          <Link href="/login" className="btn-primary inline-block mt-4">Go to login</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="card w-full max-w-md">
        <h1 className="text-xl font-bold mb-1">Create your account</h1>
        <p className="text-sm text-gray-600 mb-6">Start tracking your business in minutes.</p>

        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}

        <label className="label">Business name</label>
        <input className="input mb-4" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Chidi's Provisions Store" required />

        <label className="label">Email</label>
        <input className="input mb-4" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label className="label">Password</label>
        <input className="input mb-6" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Creating account..." : "Sign up"}
        </button>

        <p className="text-sm text-gray-600 mt-4 text-center">
          Already have an account? <Link href="/login" className="text-brand-600 font-medium">Log in</Link>
        </p>
      </form>
    </main>
  );
}