import { createTextStreamResponse, streamText } from 'ai';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';
import {
  APP_ASSISTANT_SYSTEM_PROMPT,
  APP_ASSISTANT_UNAVAILABLE_REPLY,
  getAssistantErrorDetails,
  getAssistantHelpReply,
  getAssistantStreamChunk,
  validateAssistantMessages,
} from '../../../../lib/appAssistant';

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

  const question = validation.messages[validation.messages.length - 1].content;
  const helpReply = getAssistantHelpReply(question);
  if (helpReply) {
    return new Response(helpReply, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  const result = streamText({
    model: process.env.AI_GATEWAY_MODEL || DEFAULT_MODEL,
    system: APP_ASSISTANT_SYSTEM_PROMPT,
    messages: validation.messages,
    maxOutputTokens: 400,
    abortSignal: request.signal,
    providerOptions: {
      gateway: {
        models: ['openai/gpt-4.1-mini'],
      },
    },
    onError({ error }) {
      console.error('App assistant generation failed:', getAssistantErrorDetails(error));
    },
  });

  let hasOutput = false;
  const textStream = result.stream.pipeThrough(
    new TransformStream({
      transform(part, controller) {
        const chunk = getAssistantStreamChunk(part);
        if (chunk) {
          hasOutput = true;
          controller.enqueue(chunk);
        }
      },
      flush(controller) {
        if (!hasOutput) controller.enqueue(APP_ASSISTANT_UNAVAILABLE_REPLY);
      },
    }),
  );

  return createTextStreamResponse({
    stream: textStream,
    headers: { 'Cache-Control': 'no-store' },
  });
}
