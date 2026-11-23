import 'dotenv/config';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '../server/firebaseAdmin.ts';
import { validateStrongPassword, validateUsername } from '../src/shared/validation.ts';

function generateUniqueUsername(): string {
  return `sa_${crypto.randomBytes(4).toString('hex')}`;
}

function promptText(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptHidden(question: string): Promise<string> {
  let muted = false;
  const mutableStdout = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) {
        process.stdout.write(chunk, encoding);
      }
      callback();
    },
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: mutableStdout,
    terminal: true,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      muted = false;
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1].trim();
  }
  return undefined;
}

async function run(): Promise<void> {
  const { app, db, adminSdkFirestoreReady, projectId } = initFirebaseAdmin();
  if (!app || !db || !adminSdkFirestoreReady) {
    console.error(
      'Error: FIREBASE_ADMIN_CREDENTIALS_JSON (or managed ADC with roles/datastore.user) is required to run one-time Super Admin bootstrap.'
    );
    process.exit(1);
  }

  console.log(`\nGrievanceFlow One-Time Super Admin Bootstrap (Project: ${projectId})\n`);

  // Strictly enforce one-time bootstrap: abort if a super_admin already exists
  const existingSuperAdmins = await db
    .collection('admins')
    .where('role', '==', 'super_admin')
    .limit(1)
    .get();

  if (!existingSuperAdmins.empty) {
    console.error(
      'Aborted: A super_admin already exists in Firestore. One-time bootstrap can only run once. Manage additional administrators inside Settings.'
    );
    process.exit(1);
  }

  const emailInput =
    parseArg('--email') || (await promptText('Administrator email address: '));
  const email = emailInput.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Aborted: Invalid email address.');
    process.exit(1);
  }

  const displayNameInput =
    parseArg('--name') || (await promptText('Administrator display name: '));
  const displayName = displayNameInput.trim();
  if (!displayName || displayName.length > 120) {
    console.error('Aborted: Display name must be 1 to 120 characters.');
    process.exit(1);
  }

  const suggestedUsername = generateUniqueUsername();
  const chosenUsername =
    parseArg('--username') ||
    (await promptText(`Initial username (leave blank for generated "${suggestedUsername}"): `));
  const username = (chosenUsername || suggestedUsername).trim().toLowerCase();

  const usernameCheck = validateUsername(username);
  if (!usernameCheck.valid) {
    console.error(`Aborted: ${usernameCheck.error}`);
    process.exit(1);
  }

  const existingUsername = await db
    .collection('admins')
    .where('username', '==', username)
    .limit(1)
    .get();
  if (!existingUsername.empty) {
    console.error('Aborted: Username is already in use.');
    process.exit(1);
  }

  let uid = parseArg('--uid') || '';

  if (!uid) {
    const auth = getAuth(app);
    try {
      const existingUser = await auth.getUserByEmail(email);
      uid = existingUser.uid;
      console.log('Found existing Firebase Auth user for this email; linking UID.');
    } catch (lookupErr) {
      const code = (lookupErr as { code?: string })?.code || '';
      if (code === 'auth/user-not-found') {
        const password = await promptHidden(
          'Set strong initial password (min 12 chars, upper, lower, digit, symbol): '
        );
        const pwCheck = validateStrongPassword(password);
        if (!pwCheck.valid) {
          console.error(`Aborted: ${pwCheck.error}`);
          process.exit(1);
        }
        const confirm = await promptHidden('Confirm password: ');
        if (password !== confirm) {
          console.error('Aborted: Passwords do not match.');
          process.exit(1);
        }

        const created = await auth.createUser({
          email,
          password,
          displayName,
          emailVerified: true,
          disabled: false,
        });
        uid = created.uid;
      } else {
        console.error(
          'Unable to manage Firebase Auth users automatically with this service account (requires roles/firebaseauth.admin).\n' +
            'Create the Email/Password user privately in Firebase Console -> Authentication -> Users -> Add user,\n' +
            'then re-run with: npm run bootstrap:admin -- --uid <USER_UID> --email ' +
            email
        );
        process.exit(1);
      }
    }
  }

  await db.collection('admins').doc(uid).set({
    uid,
    username,
    email,
    displayName,
    role: 'super_admin',
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await db.collection('admin_audit_logs').add({
    action: 'bootstrap_super_admin',
    actorUid: uid,
    actorUsername: username,
    actorEmail: email,
    targetId: uid,
    details: 'One-time Super Admin bootstrap completed.',
    timestamp: FieldValue.serverTimestamp(),
  });

  console.log('\nSuper Admin provisioned successfully:');
  console.log(`  UID:      ${uid}`);
  console.log(`  Username: ${username}`);
  console.log(`  Email:    ${email}`);
  console.log(`  Role:     super_admin\n`);
}

run().catch((err) => {
  console.error('Bootstrap failed:', err instanceof Error ? err.message : 'Unknown error');
  process.exit(1);
});
