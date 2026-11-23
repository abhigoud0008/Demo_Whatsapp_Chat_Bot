# GrievanceFlow Security Specification (Phase 0 — Payload-First Security TDD)

## 1. Data Invariants
1. **Default-Deny Baseline**: Every Firestore path is denied by default (`allow read, write: if false;`).
2. **Allowlisted Admin-Only Access**: No unauthenticated client, self-registered account, disabled admin, or customer may read, list, create, update, or delete any complaint, history entry, notification log, audit log, or admin directory record.
3. **Role Hierarchy Enforcement**:
   - `super_admin`: Full complaint operations, security audit log visibility, and `/admins/{uid}` allowlist management (cannot delete own active account).
   - `admin`: Read/list complaints, history, notification logs; create/update complaints; append history/notification logs/own audit logs; cannot read or mutate `/admins/{uid}` list.
   - `reviewer`: Read/list complaints, history, notification logs, and own `/admins/{uid}` document; zero write permissions on complaints or admin records.
4. **No Password Storage & No Unauthenticated Username Enumeration**: Passwords are never stored in Firestore or frontend code. Unauthenticated clients can never read `/admins/*` or `/auth_rate_limits/*`.
5. **Backend-Only Collections**: `/conversation_states/*`, `/processed_messages/*`, and `/auth_rate_limits/*` strictly deny all client SDK reads and writes (`if false`).
6. **Immutable Audit Logs**: `/complaint_history/*` and `/admin_audit_logs/*` entries cannot be updated or deleted by any client (`allow update, delete: if false;`).
7. **Resolution Remarks Requirement**: A complaint cannot transition to `status == 'Resolved'` unless `resolutionNotes` is a non-empty string (`size() >= 5 && size() <= 2000`) and `resolvedAt == request.time`.
8. **Temporal & Identity Integrity**: `createdAt == request.time` on creation; `updatedAt == request.time` on update; `createdAt` is immutable; `changedBy == request.auth.uid` on complaint history; `actorUid == request.auth.uid` on client-authored audit logs.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return `PERMISSION_DENIED`)
1. **Unauthenticated Admin Directory Read**: Unauthenticated client runs `getDocs(collection(db, 'admins'))` or `getDoc(doc(db, 'admins', 'any-uid'))` -> Denied.
2. **Unauthenticated Complaint List**: Unauthenticated client runs `getDocs(collection(db, 'complaints'))` -> Denied.
3. **Self-Privilege Escalation**: Signed-in non-admin user tries `setDoc(doc(db, 'admins', uid), { role: 'super_admin', active: true, ... })` -> Denied.
4. **Disabled Admin Read/Write**: Signed-in user whose `/admins/{uid}` doc has `active: false` tries to read `/complaints/GRV-1001` -> Denied.
5. **Reviewer Write Attempt**: Active `reviewer` tries to update `/complaints/c1` status to `Resolved` -> Denied.
6. **Shadow / Ghost Field Injection**: Active `admin` sends complaint or admin update with extra field `passwordHash: 'abc'` or `isVerified: true` -> Denied by `hasOnly(...)`.
7. **Resolve Without Remarks**: Active `admin` attempts to update `/complaints/c1` to `status: 'Resolved'` with empty `resolutionNotes: ''` -> Denied.
8. **Audit / History Tampering**: Active `super_admin` tries to `updateDoc` or `deleteDoc` on `/complaint_history/h1` or `/admin_audit_logs/a1` -> Denied.
9. **Backend Collection Snooping**: Active `super_admin` tries to read `/conversation_states/15551234567`, `/processed_messages/wamid_1`, or `/auth_rate_limits/hash1` from client SDK -> Denied.
10. **ID Poisoning / Resource Exhaustion**: Active `admin` tries to write `/complaints/<200-char-invalid-id>` or `description` > 2000 chars -> Denied by `isValidId()` and `.size()` limits.
11. **Timestamp Forgery**: Active `admin` tries to backdate `updatedAt` or `timestamp` -> Denied by `== request.time`.
12. **Impersonated Audit Attribution**: Active `admin` creates `/admin_audit_logs/a2` with `actorUid: 'another-admin-uid'` -> Denied by `incoming().actorUid == request.auth.uid`.
