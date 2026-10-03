export async function POST(request) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    return Response.json({ message: 'PAYSTACK_SECRET_KEY is not configured.' }, { status: 500 });
  }

  const { reference } = await request.json();

  if (!reference) {
    return Response.json({ message: 'Reference is required.' }, { status: 400 });
  }

  const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  return Response.json(data, { status: response.status });
}
