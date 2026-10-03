import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "../../../../lib/supabaseServer";

// This runs when Paystack redirects the user's browser back after checkout.
// The webhook (route.js in ../webhook) is the source of truth for unlocking
// access; this route just double-checks status and sends the user onward.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference");

  if (!reference) {
    return NextResponse.redirect(new URL("/pricing?status=missing_reference", request.url));
  }

  try {
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    const data = await verifyRes.json();

    if (data.status && data.data.status === "success") {
      const admin = createAdminSupabaseClient();
      const userId = data.data.metadata?.user_id;

      await admin
        .from("payments")
        .update({ status: "success", gateway_response: data.data })
        .eq("reference", reference);

      if (userId) {
        await admin
          .from("profiles")
          .update({ subscription_status: "active", subscription_expires_at: null })
          .eq("id", userId);
      }

      return NextResponse.redirect(new URL("/dashboard?payment=success", request.url));
    }

    return NextResponse.redirect(new URL("/pricing?status=failed", request.url));
  } catch (err) {
    console.error(err);
    return NextResponse.redirect(new URL("/pricing?status=error", request.url));
  }
}