import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminSupabaseClient } from "../../../../lib/supabaseServer";

// Configure this URL in Paystack Dashboard > Settings > API Keys & Webhooks
// as: https://YOUR-DOMAIN.vercel.app/api/paystack/webhook
export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  const expectedSignature = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");

  if (signature !== expectedSignature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const admin = createAdminSupabaseClient();

  if (event.event === "charge.success") {
    const { reference, metadata } = event.data;

    await admin
      .from("payments")
      .update({ status: "success", gateway_response: event.data })
      .eq("reference", reference);

    const userId = metadata?.user_id;
    if (userId) {
      await admin
        .from("profiles")
        .update({ subscription_status: "active", subscription_expires_at: null })
        .eq("id", userId);
    }
  }

  return NextResponse.json({ received: true });
}