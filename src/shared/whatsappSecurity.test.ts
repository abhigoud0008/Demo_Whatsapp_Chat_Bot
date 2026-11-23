import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  formatResolutionMessage,
  isComplaintOverdue,
  isWithinServiceWindow,
  maskPhone,
  normalizePhone,
  verifyMetaSignature,
} from './whatsappSecurity.ts';

test('verifyMetaSignature validates exact raw body HMAC-SHA256', () => {
  const secret = 'super-secret-meta-app-key';
  const rawBody = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }), 'utf8');
  const validSig = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  assert.equal(verifyMetaSignature(rawBody, validSig, secret), true);
  assert.equal(verifyMetaSignature(rawBody, 'sha256=' + '0'.repeat(64), secret), false);
  assert.equal(verifyMetaSignature(rawBody, undefined, secret), false);
  assert.equal(verifyMetaSignature(rawBody, validSig, ''), false);
});

test('isWithinServiceWindow enforces strict 24-hour window', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const inside = new Date('2026-11-22T12:05:00Z');
  const expired = new Date('2026-11-22T11:55:00Z');

  assert.equal(isWithinServiceWindow(inside, now), true);
  assert.equal(isWithinServiceWindow(expired, now), false);
  assert.equal(isWithinServiceWindow(null, now), false);
});

test('formatResolutionMessage formats required official text', () => {
  const msg = formatResolutionMessage('GRV-1001', 'Water supply restored successfully.');
  assert.match(msg, /Your complaint GRV-1001 has been resolved\./);
  assert.match(msg, /Water supply restored successfully\./);
});

test('isComplaintOverdue respects priority SLA thresholds and ignores resolved complaints', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const oldUrgent = {
    status: 'Pending' as const,
    priority: 'Urgent' as const,
    createdAt: new Date('2026-11-22T22:00:00Z'), // 14 hours ago (> 12h)
  };
  const resolvedUrgent = { ...oldUrgent, status: 'Resolved' as const };
  const freshLow = {
    status: 'Pending' as const,
    priority: 'Low' as const,
    createdAt: new Date('2026-11-23T00:00:00Z'), // 12 hours ago (< 72h)
  };

  assert.equal(isComplaintOverdue(oldUrgent, now), true);
  assert.equal(isComplaintOverdue(resolvedUrgent, now), false);
  assert.equal(isComplaintOverdue(freshLow, now), false);
});

test('phone normalization and masking protect PII', () => {
  assert.equal(normalizePhone('1 (555) 123-4567'), '+15551234567');
  assert.equal(maskPhone('+15551234567'), '+15•••••4567');
});
