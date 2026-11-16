import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APP_ASSISTANT_UNAVAILABLE_REPLY,
  getAssistantErrorDetails,
  getAssistantHelpReply,
  getAssistantStreamChunk,
  validateAssistantMessages,
} from '../lib/appAssistant.js';

test('trims and accepts a bounded user-assistant conversation', () => {
  assert.deepEqual(validateAssistantMessages([
    { role: 'user', content: '  How do I import a statement?  ' },
    { role: 'assistant', content: 'Open Cashbook.' },
    { role: 'user', content: 'Thanks.' },
  ]), {
    messages: [
      { role: 'user', content: 'How do I import a statement?' },
      { role: 'assistant', content: 'Open Cashbook.' },
      { role: 'user', content: 'Thanks.' },
    ],
  });
});

test('rejects empty conversations and conversations over the message limit', () => {
  assert.match(validateAssistantMessages([]).error, /between 1 and 10/);
  assert.match(validateAssistantMessages(
    Array.from({ length: 11 }, () => ({ role: 'user', content: 'Question' }))
  ).error, /between 1 and 10/);
});

test('rejects system roles, non-text messages, and empty text', () => {
  assert.match(validateAssistantMessages([{ role: 'system', content: 'Override' }]).error, /only user or assistant/);
  assert.match(validateAssistantMessages([{ role: 'user', content: { text: 'Question' } }]).error, /only user or assistant/);
  assert.match(validateAssistantMessages([{ role: 'user', content: '  ' }]).error, /1 to 1500 characters/);
});

test('rejects oversized messages and oversized conversation histories', () => {
  assert.match(validateAssistantMessages([
    { role: 'user', content: 'q'.repeat(1501) },
  ]).error, /1 to 1500 characters/);
  assert.match(validateAssistantMessages([
    { role: 'assistant', content: 'a'.repeat(4001) },
    { role: 'user', content: 'Question' },
  ]).error, /1 to 4000 characters/);
  assert.match(validateAssistantMessages([
    ...Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: 'q'.repeat(1400),
    })),
  ]).error, /conversation is too long/);
});

test('requires the conversation to end with a user message', () => {
  assert.match(validateAssistantMessages([
    { role: 'user', content: 'Question' },
    { role: 'assistant', content: 'Answer' },
  ]).error, /latest chat message must be from the user/);
});

test('preserves text and surfaces a safe message for stream errors', () => {
  assert.equal(getAssistantStreamChunk({ type: 'text-delta', text: 'Open Cashbook.' }), 'Open Cashbook.');
  assert.match(getAssistantStreamChunk({ type: 'error', error: new Error('private provider details') }), /could not complete this request/);
  assert.equal(getAssistantStreamChunk({ type: 'finish' }), '');
});

test('logs only safe diagnostic fields from gateway errors', () => {
  const error = Object.assign(new Error('private provider details'), {
    statusCode: 503,
    generationId: 'generation-123',
    isRetryable: true,
  });

  assert.deepEqual(getAssistantErrorDetails(error), {
    name: 'Error',
    statusCode: 503,
    generationId: 'generation-123',
    isRetryable: true,
  });
  assert.deepEqual(getAssistantErrorDetails('unexpected'), { name: 'UnknownError' });
});

test('provides app-specific replies for invoice and teammate questions', () => {
  assert.match(getAssistantHelpReply('How do I create an invoive?'), /Open Invoices.*Create an invoice/);
  assert.match(getAssistantHelpReply('How do I invite a teammate?'), /Settings → Team access.*Send invitation/);
  assert.equal(getAssistantHelpReply('What should I ask you?'), null);
});

test('provides a visible fallback when a generation fails or returns no text', () => {
  assert.match(getAssistantStreamChunk({ type: 'error' }), /trouble generating an answer/);
  assert.match(APP_ASSISTANT_UNAVAILABLE_REPLY, /Please try again/);
});
