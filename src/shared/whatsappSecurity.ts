import crypto from 'node:crypto';
import type { Complaint, ComplaintCategory, ComplaintPriority } from './types.ts';

/**
 * Verifies the Meta WhatsApp Cloud API X-Hub-Signature-256 header
 * using timing-safe HMAC-SHA256 comparison against the exact raw request body.
 */
export function verifyMetaSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!appSecret || !signatureHeader) {
    return false;
  }
  const normalized = signatureHeader.trim();
  if (!normalized.startsWith('sha256=')) {
    return false;
  }
  const providedHex = normalized.slice('sha256='.length);
  if (!/^[0-9a-fA-F]{64}$/.test(providedHex)) {
    return false;
  }

  const expectedHex = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  const providedBuf = Buffer.from(providedHex, 'hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');

  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Checks if the customer is still inside Meta's 24-hour customer-service window.
 * Ordinary free-form service messages are allowed inside 24 hours; outside 24 hours,
 * an approved Meta utility template must be used.
 */
export function isWithinServiceWindow(
  lastCustomerMessageAt: Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastCustomerMessageAt) {
    return false;
  }
  const diffMs = now.getTime() - lastCustomerMessageAt.getTime();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  return diffMs >= 0 && diffMs < twentyFourHoursMs;
}

/**
 * Formats the official WhatsApp resolution message sent to customers.
 */
export function formatResolutionMessage(ticketId: string, resolutionNotes: string): string {
  return [
    `Your complaint ${ticketId} has been resolved.`,
    '',
    'Resolution:',
    resolutionNotes.trim(),
    '',
    'Thank you for contacting our grievance helpdesk.',
  ].join('\n');
}

/**
 * Deterministic keyword-based classifier (requires zero paid AI API calls).
 */
export function classifyComplaint(text: string): {
  category: ComplaintCategory;
  priority: ComplaintPriority;
} {
  const lower = text.toLowerCase();

  let category: ComplaintCategory = 'General';
  if (/\b(water|pipe|leak|tap|supply|borewell|drainage|sewage|flood)\b/.test(lower)) {
    category = 'Water Supply';
  } else if (/\b(electric|power|outage|voltage|transformer|meter|blackout|wire|streetlight)\b/.test(lower)) {
    category = 'Electricity';
  } else if (/\b(garbage|trash|waste|sanitation|clean|sweeping|bin|odor|mosquito)\b/.test(lower)) {
    category = 'Sanitation';
  } else if (/\b(road|pothole|bridge|footpath|sidewalk|traffic|signal|asphalt|pavement)\b/.test(lower)) {
    category = 'Roads & Infrastructure';
  } else if (/\b(bill|billing|invoice|charge|refund|payment|overcharge|receipt|account)\b/.test(lower)) {
    category = 'Billing & Account';
  } else if (/\b(delay|slow|pending|waiting|late|overdue|response|appointment)\b/.test(lower)) {
    category = 'Service Delay';
  }

  let priority: ComplaintPriority = 'Medium';
  if (/\b(urgent|emergency|danger|hazard|spark|fire|shock|burst|collapse|hospital|critical)\b/.test(lower)) {
    priority = 'Urgent';
  } else if (/\b(since morning|days|no water|no power|outage|broken|blocked|major|severe)\b/.test(lower)) {
    priority = 'High';
  } else if (/\b(minor|request|inquiry|question|feedback|suggestion)\b/.test(lower)) {
    priority = 'Low';
  }

  return { category, priority };
}

/**
 * Determines whether an unresolved complaint has breached its SLA window.
 */
export function isComplaintOverdue(
  complaint: Pick<Complaint, 'status' | 'priority' | 'createdAt'>,
  now: Date = new Date()
): boolean {
  if (complaint.status === 'Resolved') {
    return false;
  }
  const ageHours = (now.getTime() - complaint.createdAt.getTime()) / (1000 * 60 * 60);
  const slaHours: Record<ComplaintPriority, number> = {
    Urgent: 12,
    High: 24,
    Medium: 48,
    Low: 72,
  };
  return ageHours > slaHours[complaint.priority];
}

/**
 * Masks the middle digits of a WhatsApp phone number for privacy-conscious views.
 */
export function maskPhone(phone: string): string {
  const cleaned = phone.trim();
  if (cleaned.length <= 6) {
    return cleaned;
  }
  const prefix = cleaned.slice(0, 3);
  const suffix = cleaned.slice(-4);
  const maskedLen = Math.max(2, cleaned.length - prefix.length - suffix.length);
  return `${prefix}${'•'.repeat(maskedLen)}${suffix}`;
}

/**
 * Normalizes a WhatsApp phone number to digits-only with leading +.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  return digits ? `+${digits}` : '';
}
