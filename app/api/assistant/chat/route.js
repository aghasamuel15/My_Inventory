import { createTextStreamResponse, streamText, toTextStream } from 'ai';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';
import { APP_ASSISTANT_SYSTEM_PROMPT, validateAssistantMessages } from '../../../../lib/appAssistant';

export const runtime = 'nodejs';

const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite';

export async function POST(request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in to use the app assistant.' }, { status: 401 });
  }

  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 32_000) {
    return NextResponse.json({ error: 'The chat request is too large.' }, { status: 413 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Could not read the chat request.' }, { status: 400 });
  }

  const validation = validateAssistantMessages(body?.messages);
  if (validation.error) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const result = streamText({
    model: process.env.AI_GATEWAY_MODEL || DEFAULT_MODEL,
    system: APP_ASSISTANT_SYSTEM_PROMPT,
    messages: validation.messages,
    maxOutputTokens: 400,
    abortSignal: request.signal,
    onError({ error }) {
      console.error('App assistant generation failed:', error instanceof Error ? error.name : 'Unknown error');
    },
  });

  return createTextStreamResponse({
    stream: toTextStream({ stream: result.stream }),
    headers: { 'Cache-Control': 'no-store' },
  });
}
