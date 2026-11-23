# GrievanceFlow Security Test Checklist

Verify every item below before moving from demonstration to live customer traffic:

## 1. Authentication & Authorization
- [ ] **Unauthenticated Access Blocked**: Direct Firestore queries without a signed-in Firebase user return `PERMISSION_DENIED`.
- [ ] **Email Verification Required**: Accounts with `email_verified == false` are rejected by both `AuthContext` and `firestore.rules`.
- [ ] **Allowlist Enforcement**: A valid Google user not present in `/admins/{uid}` (and not the bootstrapped project owner) sees the Unauthorized Account screen and cannot read `/complaints`.
- [ ] **Read-Only Reviewer Lockout**: A user with `role: "Read-Only Reviewer"` can view complaints and logs, but Firestore rejects any `create`, `update`, or `delete` attempt.
- [ ] **No Self-Privilege Escalation**: Non-Super Admins cannot create or modify documents in `/admins/{uid}`.

## 2. Firestore Integrity & Privacy
- [ ] **Backend-Only Collections Locked**: Client SDK reads/writes on `/conversation_states/*` and `/processed_messages/*` return `PERMISSION_DENIED`.
- [ ] **Immutable Audit Trail**: `update` and `delete` on `/complaint_history/*` return `PERMISSION_DENIED`.
- [ ] **Resolution Remarks Enforced**: Attempting to set `status: "Resolved"` with fewer than 5 characters in `resolutionNotes` is rejected by both client validation and `firestore.rules`.
- [ ] **Shadow Field Rejection**: Writing extra undocumented keys (e.g. `isVerified: true`) is rejected by `hasOnly(...)` schema guards.
- [ ] **Cross-Customer Status Isolation**: Sending `STATUS` + `GRV-1001` from a different WhatsApp phone number returns `"No complaint found"` without leaking status or description.

## 3. Meta WhatsApp Webhook Security
- [ ] **Signature Verification**: `POST /api/webhook/whatsapp` with missing or tampered `X-Hub-Signature-256` returns HTTP `401`.
- [ ] **Idempotency**: Replaying the same `whatsappMessageId` does not create duplicate complaint tickets.
- [ ] **Protected Notification Endpoint**: `POST /api/whatsapp/notify` without a valid `Authorization: Bearer <Firebase ID Token>` returns HTTP `401`.
- [ ] **Secret Isolation**: `GET /api/health/status` and client bundle contain zero `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, or private key credentials.
- [ ] **Honest Delivery Status**: Notification logs never show `delivered` until Meta sends a `statuses` webhook callback confirming delivery.
