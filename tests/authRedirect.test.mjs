import assert from 'node:assert/strict';
import test from 'node:test';
import { getPasswordResetRedirectUrl } from '../lib/authRedirect.js';

function withNodeEnv(value, run) {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = value;

  try {
    return run();
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
}

test('builds the reset callback URL with a safe in-app destination', () => {
  withNodeEnv('development', () => {
    assert.equal(
      getPasswordResetRedirectUrl('https://app.example.test'),
      'https://app.example.test/auth/callback/complete?next=%2Freset-password'
    );
  });
});

test('upgrades non-local production reset URLs to HTTPS', () => {
  withNodeEnv('production', () => {
    assert.equal(
      getPasswordResetRedirectUrl('http://app.example.test'),
      'https://app.example.test/auth/callback/complete?next=%2Freset-password'
    );
  });
});

test('keeps localhost usable over HTTP in production', () => {
  withNodeEnv('production', () => {
    assert.match(getPasswordResetRedirectUrl('http://localhost:3000'), /^http:\/\/localhost:3000\//);
  });
});

test('rejects non-HTTP reset URL origins', () => {
  withNodeEnv('development', () => {
    assert.throws(() => getPasswordResetRedirectUrl('file:///tmp/app'), /HTTP or HTTPS/);
  });
});
