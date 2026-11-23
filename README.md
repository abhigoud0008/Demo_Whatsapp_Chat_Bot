# GrievanceFlow — WhatsApp Grievance Resolution & Complaint Management System

GrievanceFlow is a full-stack enterprise grievance management console built with **React 19**, **TypeScript**, **Tailwind CSS**, **Aceternity UI** components, **Firebase Authentication (Email/Password with secure server-side username resolution)**, **Cloud Firestore**, and an official **Meta WhatsApp Cloud API** webhook backend.

---

## Architecture Overview

- **Frontend (`src/`)**: React 19 + Vite + React Router admin console featuring a secure Username & Password Login page, Overview Dashboard, searchable Complaint Management queue, Complaint Details & Resolution workflow, Notification History audit log, Admin Settings & RBAC Allowlist + Security Audit Log, and an interactive WhatsApp Intake Simulator.
- **Database & Auth (`firebase-blueprint.json`, `firestore.rules`, `firestore.indexes.json`)**:
  - Cloud Firestore with real-time `onSnapshot` listeners.
  - Default-deny security rules enforcing `super_admin` (`Super Admin`), `admin` (`Admin`), and `reviewer` (`Read-Only Reviewer`) roles.
  - Strictly prohibits password storage in Firestore (`admins/{uid}` schema only allows `uid`, `username`, `email`, `displayName`, `role`, `active`, `createdAt`, `updatedAt`).
  - Immutable `admin_audit_logs` collection and server-only `auth_rate_limits`, `conversation_states`, and `processed_messages` lockouts.
- **Authentication & WhatsApp Backend (`server.ts`, `server/`, `netlify/functions/`)**:
  - `POST /api/auth/login`: Server-side `username -> email` resolution (when `FIREBASE_ADMIN_CREDENTIALS_JSON` is configured), password verification via Firebase Identity Toolkit REST API, constant minimum latency, generic `401` anti-enumeration responses, sliding-window IP/target rate limiting, and audit logging.
  - `POST /api/auth/password-reset`: Anti-enumeration password reset dispatcher via Firebase Authentication.
  - `GET /api/webhook/whatsapp`: Meta webhook verification (`hub.verify_token` + `hub.challenge`).
  - `POST /api/webhook/whatsapp`: Exact raw-body `X-Hub-Signature-256` HMAC-SHA256 verification, idempotent message processing (`processed_messages`), deterministic menu-based chatbot state machine (`Hi -> 1 -> Description -> 1 -> GRV-XXXX` and `STATUS -> GRV-XXXX`), and Meta delivery status callbacks (`sent`, `delivered`, `read`, `failed`).
  - `POST /api/whatsapp/notify`: Firebase ID token + `super_admin`/`admin` role protected endpoint dispatching 24-hour service messages or approved Meta utility templates when an admin resolves a complaint.

---

## Local Setup & Testing

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your Meta WhatsApp Cloud API and Netlify server credentials when ready for live messaging:
```bash
cp .env.example .env
```

Never prefix `WHATSAPP_*` or `FIREBASE_ADMIN_CREDENTIALS_JSON` with `VITE_`. Meta webhook secrets and Firebase Admin credentials remain strictly server-side.

### 3. Run Unit & Security Tests
```bash
npx --yes tsx --test src/shared/*.test.ts server/*.test.ts
```

### 4. Lint Firestore Security Rules & TypeScript
```bash
npx eslint firestore.rules
npm run lint
```

### 5. Run Full-Stack Dev Server (Port 3000)
```bash
npm run dev
```

Open `http://localhost:3000`. Sign in with your bootstrapped administrator username/email and password, or click **Enter Client Demo Mode** to demonstrate the complete intake, triage, resolution, and notification audit workflow locally.

---

## Administrator Authentication & One-Time Super Admin Bootstrap

GrievanceFlow has **no public registration page**, **no hardcoded default passwords**, and **no hardcoded owner email bypass** in `firestore.rules`.

### 1. Enable Email/Password Provider (`grievance-project-3c98a`)
1. Open **Firebase Console → `grievance-project-3c98a` → Authentication → Sign-in method**.
2. Enable **Email/Password** (leave "Email link (passwordless sign-in)" disabled unless explicitly desired).
3. In **Authentication → Settings → Authorized domains**, ensure `localhost` and `<your-site>.netlify.app` are listed.

### 2. Provision the First `super_admin` (One-Time Only)
Run the interactive owner-only bootstrap CLI once from a trusted terminal with `FIREBASE_ADMIN_CREDENTIALS_JSON` set:
```bash
npm run bootstrap:admin -- --email your-admin@example.com --name "Primary Administrator"
```
- The CLI aborts immediately if any `super_admin` already exists in Firestore `admins`.
- It generates a unique initial username (e.g. `sa_4f91c8a2`, or pass `--username custom_name`) and prompts privately for a strong password (12+ chars with uppercase, lowercase, digit, and symbol) without echoing or logging it.
- **If using a Firestore-only service account** (`roles/datastore.user` without `roles/firebaseauth.admin`), create the user first in **Firebase Console → Authentication → Users → Add user**, copy the generated **User UID**, and run:
  ```bash
  npm run bootstrap:admin -- --uid <USER_UID> --email your-admin@example.com --name "Primary Administrator"
  ```
- **Manual Fallback (No CLI)**: Create the Email/Password user in Firebase Authentication, copy its **UID**, and create document `/admins/<UID>` in Firestore with:
  - `uid`: `<UID>`
  - `username`: `<lowercase username, e.g. sa_admin1>`
  - `email`: `<verified admin email>`
  - `displayName`: `<Admin Name>`
  - `role`: `"super_admin"`
  - `active`: `true`
  - `createdAt`: `(server timestamp)`
  - `updatedAt`: `(server timestamp)`

### 3. Adding Additional Administrators (`super_admin` Workflow)
- Create the user's **Email/Password** account in **Firebase Console → Authentication → Users** and copy their **UID**.
- Sign in to GrievanceFlow as `super_admin`, go to **Settings → Admin Allowlist**, and register the user's UID, `username`, `email`, `displayName`, and role (`super_admin`, `admin`, or `reviewer`).
- New admins can verify their email from **Settings → My Account** and use **Forgot password?** on the Login page to set or reset their own password.

### 4. Spark Plan & Hosting Limitations
- **Username Lookup**: Server-side username-to-email lookup (`POST /api/auth/login`) requires `FIREBASE_ADMIN_CREDENTIALS_JSON` on Netlify/Node so `/admins` is never readable by unauthenticated browsers. If `FIREBASE_ADMIN_CREDENTIALS_JSON` is not configured (e.g., local preview without Admin SDK credentials), admins sign in securely using their **email address** and password instead of their username.
- **TOTP Authenticator MFA**: The UI includes TOTP authenticator enrollment and sign-in verification, which Firebase Authentication supports only when upgraded to **Firebase Authentication with Identity Platform** (Blaze tier, free up to 50k MAU). On the standard Spark tier, GrievanceFlow uses Email/Password + email verification + strict server/Firestore RBAC + rate limiting without failing.

---

## Meta WhatsApp Cloud API Setup

1. Create an App in [Meta for Developers](https://developers.facebook.com/) and add the **WhatsApp** product.
2. In **WhatsApp > API Setup**, copy your **Phone Number ID** (`WHATSAPP_PHONE_NUMBER_ID`) and generate a system-user **Permanent Access Token** (`WHATSAPP_ACCESS_TOKEN`).
3. From **App Settings > Basic**, copy your **App Secret** (`WHATSAPP_APP_SECRET`).
4. Choose a random secret string for `WHATSAPP_VERIFY_TOKEN`.
5. *(Optional — only needed outside the 24-hour customer-service window)* Create and submit an approved **Utility Template** (for example `grievance_resolved_notice`) with 2 body parameters (`{{1}}` = Ticket ID, `{{2}}` = Resolution Summary). During initial live testing within 24 hours of the customer's WhatsApp message, GrievanceFlow sends a normal WhatsApp service text reply and requires no template.
6. Deploy the backend to a public HTTPS URL (see Deployment below) and configure **WhatsApp > Configuration > Webhook**:
   - Callback URL: `https://<your-domain>/api/webhook/whatsapp`
   - Verify Token: `<your WHATSAPP_VERIFY_TOKEN>`
   - Subscribe to webhook fields: `messages`

---

## Deploying to Netlify (Frontend + Serverless Functions) on Firebase Spark (Free Plan)

Cloud Firestore and Firebase Authentication on the **Spark (free) plan** allow external HTTPS servers such as **Netlify Functions** to read and write Firestore within free daily quotas—**no Firebase Blaze plan, Firebase Cloud Functions, or Firebase Storage is required**.

### 1. Deploy Firestore Rules & Indexes (`grievance-project-3c98a`)
`firebase.json` and `.firebaserc` are pre-configured for **`grievance-project-3c98a`** and the **`(default)`** Firestore database:
```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore --project grievance-project-3c98a
```

### 2. Dedicated Least-Privilege Service Account for Netlify Functions
Because Netlify runs outside Google Cloud, `netlify/functions/` need server-side authorization to access `(default)` Firestore:
1. In **Google Cloud Console → IAM & Admin → Service Accounts** (`grievance-project-3c98a`), create a dedicated service account (e.g. `grievanceflow-netlify-webhook`).
2. Grant **only** the **`Cloud Datastore User` (`roles/datastore.user`)** role (never `Owner` or `Editor`).
3. Store credentials strictly in **Netlify → Site configuration → Environment variables** (scoped to **Functions / Runtime**, marked sensitive; never commit to GitHub or prefix with `VITE_`):
   - `FIREBASE_PROJECT_ID` = `grievance-project-3c98a`
   - `FIRESTORE_DATABASE_ID` = `(default)`
   - `FIREBASE_ENABLE_ADC_FIRESTORE` = `false`
   - `FIREBASE_ADMIN_CREDENTIALS_JSON` = `<single-line JSON of the dedicated roles/datastore.user service account>`
   - `WHATSAPP_ACCESS_TOKEN` = `<Meta WhatsApp permanent system-user access token>`
   - `WHATSAPP_PHONE_NUMBER_ID` = `<Meta WhatsApp Phone Number ID>`
   - `WHATSAPP_VERIFY_TOKEN` = `<your random webhook verification token>`
   - `WHATSAPP_APP_SECRET` = `<Meta App Secret>`
   - `WHATSAPP_RESOLUTION_TEMPLATE_NAME` = `""` *(optional; only needed >24h after last customer message)*
   - `WHATSAPP_TEMPLATE_LANGUAGE` = `en_US` *(optional; defaults to `en_US`)*

### 3. Netlify Build, Redirects & Exact Function Paths (`netlify.toml`)
`netlify.toml` automatically builds `dist/`, deploys `netlify/functions/`, and maps clean API paths:
- `POST /api/auth/login` → `/.netlify/functions/auth-login`
- `POST /api/auth/password-reset` → `/.netlify/functions/auth-password-reset`
- `GET` / `POST` `/api/webhook/whatsapp` → `/.netlify/functions/whatsapp-webhook`
- `POST` `/api/whatsapp/notify` → `/.netlify/functions/whatsapp-notify`
- `GET` `/api/health` (and `/api/health/status`) → `/.netlify/functions/health`
- `/*` → `/index.html` (`status = 200` SPA fallback)

### 4. Meta WhatsApp Webhook Subscription
In **Meta for Developers → WhatsApp → Configuration → Webhook**:
- **Callback URL**: `https://<your-site>.netlify.app/api/webhook/whatsapp`
- **Verify Token**: Exact value of `WHATSAPP_VERIFY_TOKEN`
- Subscribe to field: **`messages`**

### 5. Backend Health Check & End-to-End Test Plan
1. **Health Check**: Open `https://<your-site>.netlify.app/api/health` and confirm:
   - `ok: true`, `firebaseConnected: true`, `firebaseProjectId: "grievance-project-3c98a"`, `adminSdkFirestoreReady: true`, `usernameLoginReady: true`, `adminSdkMode: "service_account"`, `whatsappConnected: true`, `webhookConfigured: true`.
2. **Admin Auth Check**: Sign in at `https://<your-site>.netlify.app/login` with your bootstrapped username and password. Confirm incorrect passwords show `"Invalid username or password."`, disabled accounts are rejected, and unauthorized Firebase Auth users cannot read `/complaints`.
3. **Webhook Handshake**: Click **Verify and Save** in Meta Dashboard (`GET /api/webhook/whatsapp` returns HTTP `200` with `hub.challenge`).
4. **Live Intake Flow**: From a real WhatsApp number, send **`Hi`** → reply **`REPORT`** (or **`1`**) → enter complaint details → reply **`1`** to confirm. Confirm you receive `GRV-1001` on WhatsApp and the ticket appears immediately in the Netlify dashboard.
5. **Live Resolution Flow**: Open the ticket, add resolution remarks, and click **Mark Resolved**. Confirm the customer receives the WhatsApp service reply (within 24h) or utility template (outside 24h) and **Notifications** updates status via Meta `statuses` callbacks without duplicates.

---

## Privacy & Data Retention Policy
- Only the customer's WhatsApp phone number, complaint text, and resolution audit records are stored.
- Phone numbers are masked in administrative list views by default (`+15•••••8901`) with explicit reveal controls.
- Customers cannot query Firestore directly and can only check ticket status for their own normalized WhatsApp sender number.
- Recommended retention: archive or anonymize `customerPhone` on resolved complaints older than 180 days, and purge `processed_messages` / `conversation_states` records older than 30 days.

---

## Netlify 502 `ERR_REQUIRE_ESM` fix (Firebase Admin SDK)

The Firebase Admin SDK dependency tree includes `jwks-rsa@4.1.0` and ESM-only `jose@6`. An older Netlify Functions Node runtime can crash when `jwks-rsa` loads `jose` with `require()`. This repository selects **Node.js 24** via `.nvmrc` and `package.json#engines`; keep the Netlify Functions runtime aligned with that version.

1. In **Netlify → Site configuration → Environment variables**, add or update `AWS_LAMBDA_JS_RUNTIME` to `nodejs24.x`. Configure this in the **Netlify UI**, not `netlify.toml`. It is a runtime selector, not a secret. If you have a conflicting `NODE_VERSION` setting, change it to `24` as well.
2. Ensure the project's build log shows Node.js 24. Netlify already uses `esbuild` for functions via `netlify.toml`.
3. Redeploy from Git with a cleared build cache. Test `/api/health/status` and then sign-in and password reset.
4. If the functions still return HTTP 502, inspect the actual Netlify Function logs before changing credentials. The environment readiness flags indicate configuration, **not** successful WhatsApp webhook delivery.
5. Do not modify Firebase secrets, access permissions, JWT validation, or WhatsApp signature verification to work around an ESM import error.

This fix addresses the **known runtime/module compatibility failure**, but the live deployment and Meta webhook must still be verified independently.

---

## Fixing Netlify `ERR_REQUIRE_ESM` in `jwks-rsa`

The previous Node 24-only fix was not sufficient on deployed Netlify functions. The `firebase-admin@14.5.1` dependency tree contains `jwks-rsa@4.1.0` which loads ESM-only `jose@6` through CommonJS `require()` in the failing runtime. This branch pins `firebase-admin` to `13.10.0` (which uses `jwks-rsa@^3.1.0`) and removes the stale Bun lockfile so Netlify's npm install resolves a consistent tree.

1. Merge the PR. In Netlify, deploy the updated **main** branch, using **Clear cache and deploy site**.
2. Ensure build logs show installation of `firebase-admin@13.10.0`, not v14, and `jwks-rsa@3.x` rather than v4. Optionally run `npm ls firebase-admin jwks-rsa jose` locally.
3. Run `npm run verify:admin-import` after installing dependencies. This checks the Admin SDK import path without credentials or accessing Firebase.
4. Open `/api/health/status` and confirm it returns JSON rather than a Netlify crash. Then test login, password reset, and WhatsApp webhook verification separately.
5. Do not share or regenerate Firebase/WhatsApp secrets to fix this module incompatibility.

This is a targeted dependency fix. Full deploy/runtime behavior still requires a real Netlify verification.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
| :--- | :--- | :--- |
| `Server-side username lookup requires FIREBASE_ADMIN_CREDENTIALS_JSON` | Username entered while backend is in keyless `id_token_only` mode | Enter your administrator email address instead, or configure `FIREBASE_ADMIN_CREDENTIALS_JSON` on Netlify/Node. |
| `429 Too many failed sign-in attempts` | Sliding-window rate limiter triggered (5 failed attempts / 15 min) | Wait 15 minutes before retrying, or verify the username/password in Firebase Console. |
| `401 Invalid X-Hub-Signature-256` on webhook POST | `WHATSAPP_APP_SECRET` mismatch or body altered | Ensure `WHATSAPP_APP_SECRET` matches Meta App Secret; Netlify v2 reads exact `req.arrayBuffer()` bytes before parsing JSON. |
| `403 Verification failed` on webhook GET | `WHATSAPP_VERIFY_TOKEN` mismatch | Verify the verify token in Meta Dashboard matches `WHATSAPP_VERIFY_TOKEN` exactly. |
| Notification shows `Not Connected` | `WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` is empty | Set Netlify server environment variables and trigger a redeploy. |
| Webhook returns `processed: false` | Server-side Firebase Admin credentials missing | Set `FIREBASE_ADMIN_CREDENTIALS_JSON` (with `roles/datastore.user`) in Netlify env vars and redeploy. |
