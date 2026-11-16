import assert from 'node:assert/strict';
import test from 'node:test';
import { canManageBusiness, canWriteBusinessData } from '../lib/businessContext.js';

test('allows owners, managers, and staff to write business data', () => {
  for (const role of ['owner', 'manager', 'staff']) {
    assert.equal(canWriteBusinessData(role), true);
  }
  assert.equal(canWriteBusinessData('viewer'), false);
  assert.equal(canWriteBusinessData('unknown'), false);
});

test('limits business management to owners and managers', () => {
  assert.equal(canManageBusiness('owner'), true);
  assert.equal(canManageBusiness('manager'), true);
  assert.equal(canManageBusiness('staff'), false);
  assert.equal(canManageBusiness('viewer'), false);
});
