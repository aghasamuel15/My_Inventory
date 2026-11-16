import assert from 'node:assert/strict';
import test from 'node:test';
import { getAccessFeeKobo } from '../lib/accessPayment.js';

function withAccessFee(value, run) {
  const original = process.env.ACCESS_FEE_KOBO;
  if (value === undefined) delete process.env.ACCESS_FEE_KOBO;
  else process.env.ACCESS_FEE_KOBO = value;

  try {
    return run();
  } finally {
    if (original === undefined) delete process.env.ACCESS_FEE_KOBO;
    else process.env.ACCESS_FEE_KOBO = original;
  }
}

test('uses the default access fee when no override is configured', () => {
  withAccessFee(undefined, () => {
    assert.equal(getAccessFeeKobo(), 500000);
  });
});

test('uses a configured positive whole-number access fee', () => {
  withAccessFee('125000', () => {
    assert.equal(getAccessFeeKobo(), 125000);
  });
});

test('rejects invalid access fee values', () => {
  for (const value of ['0', '-1', '1.5', 'not-a-number', '9007199254740992']) {
    withAccessFee(value, () => {
      assert.throws(getAccessFeeKobo, /positive whole number of kobo/);
    });
  }
});
