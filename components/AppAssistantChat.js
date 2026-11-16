'use client';

import { useEffect, useRef, useState } from 'react';

const suggestedQuestions = [
  'How do I import a bank statement?',
  'How do I invite a teammate?',
  'Where can I reconcile cash and bank?',
];

export default function AppAssistantChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messageListRef = useRef(null);
  const messageInputRef = useRef(null);
  const triggerRef = useRef(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open) messageInputRef.current?.focus();
    else if (wasOpenRef.current) triggerRef.current?.focus();
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (open && messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function sendMessage(value = draft) {
    const content = value.trim();
    if (!content || sending) return;

    const userMessage = { role: 'user', content };
    const conversation = [...messages.slice(-4), userMessage];
    setMessages((current) => [...current, userMessage, { role: 'assistant', content: '' }]);
    setDraft('');
    setError('');
    setSending(true);

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversation }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || 'The assistant could not respond. Please try again.');
      }

      if (!response.body) {
        throw new Error('The assistant response was empty. Please try again.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let responseText = '';

      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        responseText += decoder.decode(chunk, { stream: true });
        setMessages((current) => current.map((message, index) => (
          index === current.length - 1 && message.role === 'assistant'
            ? { ...message, content: responseText }
            : message
        )));
      }

      responseText += decoder.decode();
      if (responseText) {
        setMessages((current) => current.map((message, index) => (
          index === current.length - 1 && message.role === 'assistant'
            ? { ...message, content: responseText }
            : message
        )));
      } else {
        throw new Error('The assistant response was empty. Please try again.');
      }
    } catch (sendError) {
      setMessages((current) => (
        current[current.length - 1]?.role === 'assistant'
          ? current.slice(0, -1)
          : current
      ));
      setError(sendError.message || 'The assistant could not respond. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="print:hidden">
      {open && (
        <section
          id="app-assistant-panel"
          role="dialog"
          aria-label="SME Tracker app assistant"
          className="fixed inset-x-3 bottom-20 z-[60] flex h-[min(70vh,34rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl md:inset-x-auto md:bottom-20 md:right-6 md:w-[23rem]"
        >
          <header className="flex items-start justify-between gap-3 bg-[#12392e] px-4 py-3 text-white">
            <div>
              <h2 className="font-semibold">SME Tracker assistant</h2>
              <p className="mt-0.5 text-xs text-white/70">Ask how to use the app</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white"
              aria-label="Close assistant"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </header>

          <div ref={messageListRef} role="log" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto p-4">
            {!messages.length && (
              <div className="space-y-3">
                <p className="text-sm leading-6 text-slate-700">
                  I can explain SME Tracker features and workflows. I can’t view your business records or make changes.
                </p>
                <div className="flex flex-col items-start gap-2">
                  {suggestedQuestions.map((question) => (
                    <button
                      key={question}
                      type="button"
                      disabled={sending}
                      onClick={() => sendMessage(question)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-left text-xs text-slate-700 hover:border-emerald-700 hover:text-emerald-800 disabled:opacity-50"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div
                key={`${index}-${message.role}`}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <p className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-5 ${
                  message.role === 'user'
                    ? 'bg-[#12392e] text-white'
                    : 'bg-slate-100 text-slate-800'
                }`}
                >
                  {message.content || (sending && index === messages.length - 1 ? 'Thinking…' : '')}
                </p>
              </div>
            ))}
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          </div>

          <form
            className="flex items-end gap-2 border-t border-slate-200 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage();
            }}
          >
            <label htmlFor="app-assistant-message" className="sr-only">Ask a question about SME Tracker</label>
            <textarea
              ref={messageInputRef}
              id="app-assistant-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              maxLength={1500}
              rows={1}
              placeholder="Ask a question…"
              className="max-h-24 min-h-10 flex-1 resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#12392e] text-white hover:bg-[#1a4b3b] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send question"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                <path d="m5 12 14-7-4 14-3-6-7-1Z" />
                <path d="m12 13 7-8" />
              </svg>
            </button>
          </form>
          <p className="px-3 pb-3 text-[10px] leading-4 text-slate-500">
            Don’t share passwords, payment details, or sensitive business information.
          </p>
        </section>
      )}

      {!open && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-[60] flex min-h-12 items-center gap-2 rounded-full bg-[#12392e] px-4 text-sm font-semibold text-white shadow-lg transition hover:bg-[#1a4b3b] md:bottom-6 md:right-6"
          aria-label="Open app assistant"
          aria-haspopup="dialog"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
            <path d="M5 18.5 3.5 21l4-.8a9 9 0 1 0-2.5-1.7Z" />
            <path d="M8 10h8M8 14h5" />
          </svg>
          App help
        </button>
      )}
    </div>
  );
}
