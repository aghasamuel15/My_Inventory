"use client";

import { useState } from "react";
import { createClient } from "../../lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function PricingPage() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handlePay() {
    setLoading(true);
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const res = await fetch("/api/paystack/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, userId: user.id }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Something went wrong. Please try again.");
      return;
    }

    // Redirect to Paystack's hosted checkout page
    window.location.href = data.authorization_url;
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="card max-w-md w-full text-center">
        <h1 className="text-xl font-bold mb-2">Unlock SME Tracker</h1>
        <p className="text-gray-600 text-sm mb-6">
          A one-time access fee unlocks sales tracking, expenses, customer
          debt tracking, invoicing, and reports — no monthly charges.
        </p>
        <div className="text-3xl font-bold text-brand-700 mb-6">₦5,000</div>

        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}

        <button onClick={handlePay} disabled={loading} className="btn-primary w-full">
          {loading ? "Redirecting to payment..." : "Pay with Paystack"}
        </button>
      </div>
    </main>
  );
}