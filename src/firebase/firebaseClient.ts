import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import appletFirebaseConfig from '../../firebase-applet-config.json';

const resolvedConfig = {
  projectId: appletFirebaseConfig.projectId,
  appId: appletFirebaseConfig.appId,
  apiKey: appletFirebaseConfig.apiKey,
  authDomain: appletFirebaseConfig.authDomain,
  storageBucket: appletFirebaseConfig.storageBucket,
  messagingSenderId: appletFirebaseConfig.messagingSenderId,
  firestoreDatabaseId: appletFirebaseConfig.firestoreDatabaseId,
};

const app = initializeApp(resolvedConfig);

const dbId = resolvedConfig.firestoreDatabaseId?.trim();
export const db =
  dbId && dbId !== '(default)' ? getFirestore(app, dbId) : getFirestore(app);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: Array<{
      providerId?: string | null;
      email?: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<{ reachable: boolean; error?: string }> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { reachable: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes('the client is offline') ||
      msg.includes('does not exist') ||
      msg.includes('NOT_FOUND')
    ) {
      console.error('Firestore connectivity check failed:', msg);
      return { reachable: false, error: msg };
    }
    // A permission-denied response from Firestore servers confirms network connectivity
    return { reachable: true };
  }
}

export const FIREBASE_PROJECT_ID = resolvedConfig.projectId;
export const FIRESTORE_DATABASE_ID = dbId || '(default)';
