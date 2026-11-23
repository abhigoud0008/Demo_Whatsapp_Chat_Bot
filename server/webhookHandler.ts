import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  formatStatusLookupReply,
  formatTicketCreatedReply,
  processChatbotTurn,
} from '../src/shared/chatbotEngine.ts';
import {
  normalizeAdminRole,
  type ConversationStep,
  type IntegrationStatus,
  type NotificationDeliveryStatus,
} from '../src/shared/types.ts';
import {
  formatResolutionMessage,
  isWithinServiceWindow,
  normalizePhone,
  verifyMetaSignature,
} from '../src/shared/whatsappSecurity.ts';
import {
  initFirebaseAdmin,
  isFirestorePermissionError,
  verifyFirebaseIdToken,
} from './firebaseAdmin.ts';
import {
  isResolutionTemplateConfigured,
  isWebhookSecurityConfigured,
  isWhatsAppConfigured,
  sendWhatsAppResolutionTemplate,
  sendWhatsAppTextMessage,
} from './whatsappClient.ts';

let lastWebhookEventAt: string | null = null;

export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
        statuses?: Array<{
          id?: string;
          status?: string;
          recipient_id?: string;
          errors?: Array<{ code?: number; title?: string; message?: string }>;
        }>;
      };
    }>;
  }>;
}

export function getIntegrationStatus(): IntegrationStatus {
  const { projectId, adminSdkFirestoreReady, adminSdkMode } = initFirebaseAdmin();
  return {
    firebaseConnected: Boolean(projectId),
    firebaseProjectId: projectId,
    whatsappConnected: isWhatsAppConfigured(),
    webhookConfigured: isWhatsAppConfigured() && isWebhookSecurityConfigured(),
    verifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN?.trim()),
    appSecretConfigured: Boolean(process.env.WHATSAPP_APP_SECRET?.trim()),
    resolutionTemplateConfigured: isResolutionTemplateConfigured(),
    usernameLoginReady: adminSdkFirestoreReady,
    adminSdkFirestoreReady,
    adminSdkMode,
    lastWebhookEventAt,
  };
}

export function verifyWebhookChallenge(params: {
  mode?: string | null;
  token?: string | null;
  challenge?: string | null;
}): { status: number; body: string } {
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (!expectedToken) {
    return { status: 503, body: 'Webhook verify token is not configured.' };
  }

  if (
    params.mode === 'subscribe' &&
    typeof params.token === 'string' &&
    typeof params.challenge === 'string'
  ) {
    const tokenBuf = Buffer.from(params.token);
    const expectedBuf = Buffer.from(expectedToken);
    if (
      tokenBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(tokenBuf, expectedBuf)
    ) {
      return { status: 200, body: params.challenge };
    }
  }

  return { status: 403, body: 'Verification failed.' };
}

export async function processWebhookPost(args: {
  rawBody: Buffer;
  signatureHeader?: string;
  parsedBody: unknown;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!appSecret) {
    return {
      status: 503,
      body: { error: 'WHATSAPP_APP_SECRET is not configured on the server.' },
    };
  }

  if (!verifyMetaSignature(args.rawBody, args.signatureHeader, appSecret)) {
    return {
      status: 401,
      body: { error: 'Invalid X-Hub-Signature-256.' },
    };
  }

  const payload = args.parsedBody as MetaWebhookPayload;
  if (payload?.object !== 'whatsapp_business_account') {
    return { status: 200, body: { received: true, ignored: true } };
  }

  lastWebhookEventAt = new Date().toISOString();

  const { db, adminSdkFirestoreReady } = initFirebaseAdmin();
  if (!adminSdkFirestoreReady || !db) {
    return {
      status: 200,
      body: {
        received: true,
        processed: false,
        reason:
          'Server-side Firestore persistence requires FIREBASE_ADMIN_CREDENTIALS_JSON (dedicated least-privilege service account) configured on the server.',
      },
    };
  }

  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        // 1. Handle delivery status callbacks (sent / delivered / read / failed)
        for (const statusEvent of value.statuses ?? []) {
          if (!statusEvent.id || !statusEvent.status) continue;
          const mappedStatus = mapMetaDeliveryStatus(statusEvent.status);
          const errorDetails = statusEvent.errors?.[0]
            ? `${statusEvent.errors[0].title ?? 'Meta Error'} (${statusEvent.errors[0].code ?? 'unknown'}): ${statusEvent.errors[0].message ?? ''}`
            : '';

          const logSnap = await db
            .collection('notification_logs')
            .where('messageId', '==', statusEvent.id)
            .limit(1)
            .get();

          if (!logSnap.empty) {
            const logDoc = logSnap.docs[0];
            await logDoc.ref.update({
              status: mappedStatus,
              error: errorDetails.slice(0, 1000),
              updatedAt: FieldValue.serverTimestamp(),
            });

            const complaintId = logDoc.get('complaintId') as string | undefined;
            if (complaintId) {
              await db.collection('complaints').doc(complaintId).update({
                notificationStatus: mapToComplaintNotificationStatus(mappedStatus),
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
          }
        }

        // 2. Handle incoming customer messages
        for (const message of value.messages ?? []) {
          const messageId = message.id;
          const rawFrom = message.from;
          if (!messageId || !rawFrom) continue;

          const senderPhone = normalizePhone(rawFrom);
          if (!senderPhone) continue;

          const processedRef = db.collection('processed_messages').doc(sanitizeDocId(messageId));
          const alreadyProcessed = await db.runTransaction(async (tx) => {
            const snap = await tx.get(processedRef);
            if (snap.exists) {
              return true;
            }
            tx.set(processedRef, {
              whatsappMessageId: messageId,
              processedAt: FieldValue.serverTimestamp(),
              processingStatus: 'processing',
            });
            return false;
          });

          if (alreadyProcessed) {
            continue;
          }

          const stateRef = db.collection('conversation_states').doc(sanitizeDocId(senderPhone));
          const stateSnap = await stateRef.get();
          const currentStep: ConversationStep =
            (stateSnap.get('currentStep') as ConversationStep) || 'IDLE';
          const draftComplaint: string = (stateSnap.get('draftComplaint') as string) || '';

          const msgType = normalizeMessageType(message.type);
          const messageText = message.text?.body ?? '';

          const turn = processChatbotTurn({
            currentStep,
            draftComplaint,
            messageText,
            messageType: msgType,
          });

          let finalReplyText = turn.replyText;
          let relatedComplaintId = 'system';
          let relatedTicketId = '';
          let outboundType: 'menu_reply' | 'acknowledgment' | 'status_reply' = 'menu_reply';

          if (turn.sideEffect.type === 'CREATE_COMPLAINT') {
            const created = await createComplaintTransaction(db, {
              customerPhone: senderPhone,
              description: turn.sideEffect.description,
              category: turn.sideEffect.category,
              priority: turn.sideEffect.priority,
              source: 'whatsapp',
            });
            relatedComplaintId = created.complaintId;
            relatedTicketId = created.ticketId;
            outboundType = 'acknowledgment';
            finalReplyText = formatTicketCreatedReply(created.ticketId);
          } else if (turn.sideEffect.type === 'LOOKUP_STATUS') {
            const ticketQuery = await db
              .collection('complaints')
              .where('ticketId', '==', turn.sideEffect.ticketId)
              .limit(1)
              .get();

            const docSnap = ticketQuery.docs[0];
            const lookupRecord = docSnap
              ? {
                  ticketId: String(docSnap.get('ticketId')),
                  customerPhone: String(docSnap.get('customerPhone')),
                  status: docSnap.get('status') as 'Pending' | 'In Progress' | 'Resolved',
                  resolutionNotes: String(docSnap.get('resolutionNotes') ?? ''),
                }
              : null;

            if (docSnap && lookupRecord?.customerPhone === senderPhone) {
              relatedComplaintId = docSnap.id;
              relatedTicketId = lookupRecord.ticketId;
            }
            outboundType = 'status_reply';
            finalReplyText = formatStatusLookupReply(
              turn.sideEffect.ticketId,
              senderPhone,
              lookupRecord
            );
          }

          await stateRef.set(
            {
              phone: senderPhone,
              currentStep: turn.nextStep,
              draftComplaint: turn.nextDraftComplaint,
              lastInteractionAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          const sendResult = await sendWhatsAppTextMessage(senderPhone, finalReplyText);

          await db.collection('notification_logs').add({
            complaintId: relatedComplaintId,
            ticketId: relatedTicketId,
            messageId: sendResult.messageId,
            recipient: senderPhone,
            messageType: outboundType,
            status: sendResult.status,
            error: sendResult.error,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          await processedRef.update({
            processingStatus: msgType === 'text' ? 'completed' : 'ignored_media',
          });
        }
      }
    }

    return { status: 200, body: { received: true, processed: true } };
  } catch (err) {
    if (isFirestorePermissionError(err)) {
      console.error('Webhook Firestore permission denied: service account lacks roles/datastore.user.');
      return {
        status: 503,
        body: {
          error:
            'Server-side Firestore write denied. Ensure the service account has roles/datastore.user.',
        },
      };
    }
    console.error('Webhook processing error:', err instanceof Error ? err.message : 'Unknown error');
    return { status: 500, body: { error: 'Internal webhook processing error' } };
  }
}

export async function processAdminNotify(args: {
  authHeader?: string | null;
  body: unknown;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const decoded = await verifyFirebaseIdToken(args.authHeader);
  if (!decoded) {
    return {
      status: 401,
      body: { error: 'Unauthorized: Valid Firebase ID token required.' },
    };
  }

  const { db, adminSdkFirestoreReady } = initFirebaseAdmin();

  if (adminSdkFirestoreReady && db) {
    try {
      const adminSnap = await db.collection('admins').doc(decoded.uid).get();
      const role = normalizeAdminRole(adminSnap.get('role'));
      const active = adminSnap.get('active') === true;
      if (!adminSnap.exists || !active || (role !== 'super_admin' && role !== 'admin')) {
        return {
          status: 403,
          body: {
            error: 'Forbidden: Active super_admin or admin allowlist membership required.',
          },
        };
      }
    } catch (err) {
      if (isFirestorePermissionError(err)) {
        console.warn('Admin allowlist check skipped: IAM roles/datastore.user not granted.');
      } else {
        return {
          status: 500,
          body: { error: 'Failed to verify administrator authorization.' },
        };
      }
    }
  }

  const {
    complaintId,
    ticketId,
    customerPhone,
    resolutionNotes,
    lastCustomerMessageAt,
  } = (args.body ?? {}) as {
    complaintId?: string;
    ticketId?: string;
    customerPhone?: string;
    resolutionNotes?: string;
    lastCustomerMessageAt?: string | null;
  };

  if (!complaintId || !ticketId || !customerPhone || !resolutionNotes) {
    return {
      status: 400,
      body: { error: 'Missing required notification fields.' },
    };
  }

  // Prevent duplicate resolution notifications for the same resolution cycle
  if (adminSdkFirestoreReady && db) {
    try {
      const complaintSnap = await db.collection('complaints').doc(complaintId).get();
      const resolvedAtTs = complaintSnap.get('resolvedAt') as Timestamp | null | undefined;
      const resolvedAtMs = resolvedAtTs?.toMillis ? resolvedAtTs.toMillis() : 0;

      const existingLogs = await db
        .collection('notification_logs')
        .where('complaintId', '==', complaintId)
        .limit(20)
        .get();

      const recentResolutionLog = existingLogs.docs.find((d) => {
        const msgType = String(d.get('messageType') ?? '');
        const status = String(d.get('status') ?? '');
        if (msgType !== 'resolution_service' && msgType !== 'resolution_template') {
          return false;
        }
        if (!['accepted_by_meta', 'sent', 'delivered', 'read'].includes(status)) {
          return false;
        }
        const createdTs = d.get('createdAt') as Timestamp | null | undefined;
        const createdMs = createdTs?.toMillis ? createdTs.toMillis() : 0;
        return resolvedAtMs > 0 ? createdMs >= resolvedAtMs - 5000 : Date.now() - createdMs < 120_000;
      });

      if (recentResolutionLog) {
        return {
          status: 200,
          body: {
            ok: true,
            duplicatePrevented: true,
            loggedServerSide: true,
            status: recentResolutionLog.get('status') ?? 'accepted_by_meta',
            messageId: recentResolutionLog.get('messageId') ?? '',
            messageType: recentResolutionLog.get('messageType') ?? 'resolution_service',
            error: '',
          },
        };
      }
    } catch (err) {
      if (!isFirestorePermissionError(err)) {
        console.warn('Duplicate resolution check skipped due to Firestore read error.');
      }
    }
  }

  if (!isWhatsAppConfigured()) {
    return {
      status: 200,
      body: {
        ok: false,
        status: 'not_connected',
        messageId: '',
        messageType: 'resolution_service',
        loggedServerSide: false,
        error: 'WhatsApp Cloud API credentials are not configured on the server.',
      },
    };
  }

  const lastInteractionDate = lastCustomerMessageAt ? new Date(lastCustomerMessageAt) : null;
  const insideWindow = isWithinServiceWindow(
    lastInteractionDate && !Number.isNaN(lastInteractionDate.getTime()) ? lastInteractionDate : null
  );

  const messageType = insideWindow ? 'resolution_service' : 'resolution_template';
  const result = insideWindow
    ? await sendWhatsAppTextMessage(customerPhone, formatResolutionMessage(ticketId, resolutionNotes))
    : await sendWhatsAppResolutionTemplate(customerPhone, ticketId, resolutionNotes);

  let loggedServerSide = false;
  if (adminSdkFirestoreReady && db) {
    try {
      await db.collection('notification_logs').add({
        complaintId,
        ticketId,
        messageId: result.messageId,
        recipient: customerPhone,
        messageType,
        status: result.status,
        error: result.error,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      loggedServerSide = true;
    } catch (err) {
      console.warn(
        'Optional server-side notification log write skipped:',
        isFirestorePermissionError(err) ? 'IAM roles/datastore.user not granted' : 'Firestore write error'
      );
    }
  }

  return {
    status: 200,
    body: {
      ok: result.ok,
      status: result.status,
      messageId: result.messageId,
      messageType,
      loggedServerSide,
      error: result.error,
    },
  };
}

/**
 * Express wrapper: GET /api/webhook/whatsapp
 */
export function handleWebhookVerify(req: Request, res: Response): void {
  const result = verifyWebhookChallenge({
    mode: typeof req.query['hub.mode'] === 'string' ? req.query['hub.mode'] : null,
    token: typeof req.query['hub.verify_token'] === 'string' ? req.query['hub.verify_token'] : null,
    challenge: typeof req.query['hub.challenge'] === 'string' ? req.query['hub.challenge'] : null,
  });
  res.status(result.status).send(result.body);
}

/**
 * Express wrapper: POST /api/webhook/whatsapp
 */
export async function handleWebhookEvent(req: RawBodyRequest, res: Response): Promise<void> {
  const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
  const result = await processWebhookPost({
    rawBody,
    signatureHeader: req.header('x-hub-signature-256'),
    parsedBody: req.body,
  });
  res.status(result.status).json(result.body);
}

/**
 * Express wrapper: POST /api/whatsapp/notify
 */
export async function handleAdminNotify(req: Request, res: Response): Promise<void> {
  const result = await processAdminNotify({
    authHeader: req.header('authorization'),
    body: req.body,
  });
  res.status(result.status).json(result.body);
}

async function createComplaintTransaction(
  db: FirebaseFirestore.Firestore,
  input: {
    customerPhone: string;
    description: string;
    category: string;
    priority: string;
    source: 'whatsapp' | 'simulator';
  }
): Promise<{ complaintId: string; ticketId: string }> {
  const counterRef = db.collection('system_counters').doc('complaints');
  const complaintRef = db.collection('complaints').doc();
  const historyRef = db.collection('complaint_history').doc();

  const ticketId = await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const nextNum = counterSnap.exists ? Number(counterSnap.get('nextNumber')) : 1001;
    const generatedTicketId = `GRV-${nextNum}`;

    tx.set(
      counterRef,
      {
        nextNumber: nextNum + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const now = Timestamp.now();
    tx.set(complaintRef, {
      ticketId: generatedTicketId,
      customerPhone: input.customerPhone,
      description: input.description,
      category: input.category,
      priority: input.priority,
      status: 'Pending',
      assignedAdminId: '',
      assignedAdminName: 'Unassigned',
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      resolutionNotes: '',
      notificationStatus: isWhatsAppConfigured() ? 'Queued' : 'Not Connected',
      source: input.source,
      lastCustomerMessageAt: now,
    });

    tx.set(historyRef, {
      complaintId: complaintRef.id,
      ticketId: generatedTicketId,
      previousStatus: 'None',
      newStatus: 'Pending',
      changedBy: 'whatsapp_webhook',
      changedByName: 'WhatsApp Intake Bot',
      timestamp: now,
      remarks: 'Complaint registered via WhatsApp chatbot.',
    });

    return generatedTicketId;
  });

  return { complaintId: complaintRef.id, ticketId };
}

function sanitizeDocId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

function normalizeMessageType(
  rawType: string | undefined
): 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'unknown' {
  switch (rawType) {
    case 'text':
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker':
      return rawType;
    default:
      return 'unknown';
  }
}

function mapMetaDeliveryStatus(status: string): NotificationDeliveryStatus {
  switch (status) {
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
      return 'failed';
    default:
      return 'accepted_by_meta';
  }
}

function mapToComplaintNotificationStatus(
  status: NotificationDeliveryStatus
): 'Sent' | 'Delivered' | 'Read' | 'Failed' | 'Queued' {
  switch (status) {
    case 'sent':
      return 'Sent';
    case 'delivered':
      return 'Delivered';
    case 'read':
      return 'Read';
    case 'failed':
      return 'Failed';
    default:
      return 'Queued';
  }
}
