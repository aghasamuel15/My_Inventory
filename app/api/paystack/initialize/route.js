export async function POST(request) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    return Response.json({ message: 'PAYSTACK_SECRET_KEY is not configured.' }, { status: 500 });
  }

  const body = await request.json();
  const amountKobo = Number(body.amountKobo || process.env.NEXT_PUBLIC_ACCESS_FEE_KOBO || 500000);

  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: body.email,
      amount: amountKobo,
      currency: 'NGN',
      callback_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/pricing`,
      metadata: {
        business_name: body.business_name || '',
      },
    }),
  });

  const data = await response.json();
  return Response.json(data, { status: response.status });
}
