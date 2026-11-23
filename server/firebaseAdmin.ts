import fs from 'node:fs';
import path from 'node:path';
import {
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { AdminSdkMode } from '../src/shared/types.ts';

interface AppletConfig {
  projectId: string;
  firestoreDatabaseId?: string;
  apiKey?: string;
}

let cachedConfig: AppletConfig | null = null;
let cachedApp: App | null = null;
let cachedFirestore: Firestore | null = null;
let firestoreAdminEnabled = false;
let cachedAdminSdkMode: AdminSdkMode = 'unconfigured';

export function getFirebaseAppletConfig(): AppletConfig {
  if (cachedConfig) {
    return cachedConfig;
  }
  const envProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const envDbId = process.env.FIRESTORE_DATABASE_ID?.trim();
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as AppletConfig;
    cachedConfig = {
      projectId: envProjectId || parsed.projectId || 'grievance-project-3c98a',
      firestoreDatabaseId: envDbId || parsed.firestoreDatabaseId || '(default)',
      apiKey: parsed.apiKey || '',
    };
    return cachedConfig;
  } catch {
    return {
      projectId: envProjectId || 'grievance-project-3c98a',
      firestoreDatabaseId: envDbId || '(default)',
      apiKey: '',
    };
  }
}

function getServiceAccountFromEnv(fallbackProjectId: string): ServiceAccount | null {
  const jsonRaw = process.env.FIREBASE_ADMIN_CREDENTIALS_JSON?.trim();
  if (!jsonRaw) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonRaw) as {
      project_id?: string;
      projectId?: string;
      client_email?: string;
      clientEmail?: string;
      private_key?: string;
      privateKey?: string;
    };
    const clientEmail = (parsed.client_email || parsed.clientEmail || '').trim();
    const privateKey = (parsed.private_key || parsed.privateKey || '').replace(/\\n/g, '\n');
    const projectId = (parsed.project_id || parsed.projectId || fallbackProjectId).trim();
    if (clientEmail && privateKey && projectId) {
      return { projectId, clientEmail, privateKey };
    }
    console.error('FIREBASE_ADMIN_CREDENTIALS_JSON is missing client_email or private_key.');
  } catch {
    console.error('Failed to parse FIREBASE_ADMIN_CREDENTIALS_JSON: invalid JSON format.');
  }

  return null;
}

/**
 * Server-side Firebase Admin SDK initializer supporting Netlify Functions and Node servers.
 * Priority:
 * 1. Dedicated least-privilege service account via FIREBASE_ADMIN_CREDENTIALS_JSON (server-side only).
 * 2. Managed ADC / Workload Identity Federation when FIREBASE_ENABLE_ADC_FIRESTORE=true.
 * 3. Keyless ID-token-only mode (verifies Firebase ID tokens with zero IAM required).
 */
export function initFirebaseAdmin(): {
  app: App | null;
  db: Firestore | null;
  adminSdkFirestoreReady: boolean;
  adminSdkMode: AdminSdkMode;
  projectId: string;
} {
  const config = getFirebaseAppletConfig();
  if (!config.projectId || config.projectId === 'remixed-project-id') {
    return {
      app: null,
      db: null,
      adminSdkFirestoreReady: false,
      adminSdkMode: 'unconfigured',
      projectId: '',
    };
  }

  if (cachedApp) {
    return {
      app: cachedApp,
      db: cachedFirestore,
      adminSdkFirestoreReady: firestoreAdminEnabled,
      adminSdkMode: cachedAdminSdkMode,
      projectId: config.projectId,
    };
  }

  const serviceAccount = getServiceAccountFromEnv(config.projectId);
  const enableAdcFirestore = process.env.FIREBASE_ENABLE_ADC_FIRESTORE === 'true';

  if (getApps().length > 0) {
    cachedApp = getApp();
    if (serviceAccount) {
      firestoreAdminEnabled = true;
      cachedAdminSdkMode = 'service_account';
    } else if (enableAdcFirestore) {
      firestoreAdminEnabled = true;
      cachedAdminSdkMode = 'adc_firestore';
    } else {
      firestoreAdminEnabled = false;
      cachedAdminSdkMode = 'id_token_only';
    }
  } else if (serviceAccount) {
    cachedApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId || config.projectId,
    });
    firestoreAdminEnabled = true;
    cachedAdminSdkMode = 'service_account';
  } else if (enableAdcFirestore) {
    try {
      cachedApp = initializeApp({
        credential: applicationDefault(),
        projectId: config.projectId,
      });
      firestoreAdminEnabled = true;
      cachedAdminSdkMode = 'adc_firestore';
    } catch (err) {
      console.warn(
        'Managed Application Default Credentials unavailable; falling back to ID-token-only mode:',
        err instanceof Error ? err.message : 'ADC initialization failed'
      );
      cachedApp = initializeApp({ projectId: config.projectId });
      firestoreAdminEnabled = false;
      cachedAdminSdkMode = 'id_token_only';
    }
  } else {
    cachedApp = initializeApp({ projectId: config.projectId });
    firestoreAdminEnabled = false;
    cachedAdminSdkMode = 'id_token_only';
  }

  if (firestoreAdminEnabled && cachedApp) {
    const dbId = config.firestoreDatabaseId;
    cachedFirestore =
      dbId && dbId !== '(default)'
        ? getFirestore(cachedApp, dbId)
        : getFirestore(cachedApp);
  }

  return {
    app: cachedApp,
    db: cachedFirestore,
    adminSdkFirestoreReady: firestoreAdminEnabled,
    adminSdkMode: cachedAdminSdkMode,
    projectId: config.projectId,
  };
}

/**
 * Verifies a Firebase ID Token sent by the admin dashboard.
 * Works on any Firebase project (Spark or Blaze) without IAM permissions.
 */
export async function verifyFirebaseIdToken(
  bearerHeader: string | undefined | null
): Promise<DecodedIdToken | null> {
  if (!bearerHeader || !bearerHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = bearerHeader.slice('Bearer '.length).trim();
  if (!token) {
    return null;
  }
  const { app } = initFirebaseAdmin();
  if (!app) {
    return null;
  }
  try {
    return await getAuth(app).verifyIdToken(token);
  } catch {
    return null;
  }
}

export function isFirestorePermissionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const candidate = err as { code?: unknown; message?: unknown };
  if (
    candidate.code === 7 ||
    candidate.code === 'permission-denied' ||
    candidate.code === 'PERMISSION_DENIED'
  ) {
    return true;
  }
  if (typeof candidate.message === 'string') {
    return (
      candidate.message.includes('PERMISSION_DENIED') ||
      candidate.message.includes('Missing or insufficient permissions') ||
      candidate.message.includes('403')
    );
  }
  return false;
}
