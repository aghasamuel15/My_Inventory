import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Access payments are temporarily disabled while the app is being tested.' },
    { status: 503 },
  );
}
