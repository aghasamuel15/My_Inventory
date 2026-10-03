import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "../../../../lib/supabaseServer";

export async function POST(request) {
  try {
    const { email, userId } = await request.json();

    if (!email || !userId) {
      return NextResponse.json({ error: "Missing email or userId" }, { status: 400 });
    }

    const amountKobo = Number(process.env.NEXT_PUBLIC_ACCESS_FEE_KOBO || 500000);
    const reference = `sme_${userId.slice(0, 8)}_${Date.now()}`;

    // Record a pending payment row first
    const admin = createAdminSupabaseClient();
    await admin.from("payments").insert({
      user_id: userId,
      reference,
      amount: amountKobo / 100,
      status: "pending",
    });

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountKobo,
        reference,
        callback_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/paystack/verify?reference=${reference}`,
        metadata: { user_id: userId },
      }),
    });

    const data = await paystackRes.json();

    if (!data.status) {
      return NextResponse.json({ error: data.message || "Could not initialize payment" }, { status: 400 });
    }

    return NextResponse.json({
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}