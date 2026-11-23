import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import netlifyHealthHandler from '../netlify/functions/health.ts';
import netlifyNotifyHandler from '../netlify/functions/whatsapp-notify.ts';
import netlifyWebhookHandler from '../netlify/functions/whatsapp-webhook.ts';
import { getFirebaseAppletConfig, isFirestorePermissionError } from './firebaseAdmin.ts';
import { sendWhatsAppResolutionTemplate } from './whatsappClient.ts';
import {
  getIntegrationStatus,
  handleAdminNotify,
  handleWebhookEvent,
  handleWebhookVerify,
  type RawBodyRequest,
} from './webhookHandler.ts';

function createMockResponse() {
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    send(payload: unknown) {
      body = payload;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as unknown as ExpressResponse;
  return {
    res,
    getResult: () => ({ statusCode, body }),
  };
}

test('handleWebhookVerify returns challenge when token matches and 403 on mismatch', () => {
  const prevToken = process.env.WHATSAPP_VERIFY_TOKEN;
  process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify-token-123';

  try {
    const okMock = createMockResponse();
    handleWebhookVerify(
      {
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'test-verify-token-123',
          'hub.challenge': 'challenge_9988',
        },
      } as unknown as ExpressRequest,
      okMock.res
    );
    assert.deepEqual(okMock.getResult(), { statusCode: 200, body: 'challenge_9988' });

    const badMock = createMockResponse();
    handleWebhookVerify(
      {
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong-token',
          'hub.challenge': 'challenge_9988',
        },
      } as unknown as ExpressRequest,
      badMock.res
    );
    assert.equal(badMock.getResult().statusCode, 403);
  } finally {
    process.env.WHATSAPP_VERIFY_TOKEN = prevToken;
  }
});

test('handleWebhookEvent rejects invalid X-Hub-Signature-256 with 401', async () => {
  const prevSecret = process.env.WHATSAPP_APP_SECRET;
  process.env.WHATSAPP_APP_SECRET = 'meta-app-secret-xyz';

  try {
    const mock = createMockResponse();
    await handleWebhookEvent(
      {
        header: () => 'sha256=' + 'a'.repeat(64),
        rawBody: Buffer.from('{"object":"whatsapp_business_account"}'),
        body: { object: 'whatsapp_business_account' },
      } as unknown as RawBodyRequest,
      mock.res
    );
    assert.equal(mock.getResult().statusCode, 401);
  } finally {
    process.env.WHATSAPP_APP_SECRET = prevSecret;
  }
});

test('handleAdminNotify rejects requests without valid Firebase ID token with 401', async () => {
  const mock = createMockResponse();
  await handleAdminNotify(
    {
      header: () => undefined,
      body: {
        complaintId: 'c1',
        ticketId: 'GRV-1001',
        customerPhone: '+15551234567',
        resolutionNotes: 'Fixed',
      },
    } as unknown as ExpressRequest,
    mock.res
  );
  assert.equal(mock.getResult().statusCode, 401);
});

test('getIntegrationStatus reports keyless id_token_only mode without exposing private credentials', () => {
  const prevTemplate = process.env.WHATSAPP_RESOLUTION_TEMPLATE_NAME;
  delete process.env.WHATSAPP_RESOLUTION_TEMPLATE_NAME;

  try {
    const config = getFirebaseAppletConfig();
    assert.equal(config.projectId, 'grievance-project-3c98a');
    assert.equal(config.firestoreDatabaseId, '(default)');

    const status = getIntegrationStatus();
    assert.equal(status.firebaseConnected, true);
    assert.equal(status.firebaseProjectId, 'grievance-project-3c98a');
    assert.equal(status.adminSdkMode, 'id_token_only');
    assert.equal(status.adminSdkFirestoreReady, false);
    assert.equal(status.usernameLoginReady, false);
    assert.equal(status.resolutionTemplateConfigured, false);
    const serialized = JSON.stringify(status);
    assert.equal(serialized.includes('PRIVATE KEY'), false);
    assert.equal(serialized.includes('SERVICE_ACCOUNT'), false);
  } finally {
    process.env.WHATSAPP_RESOLUTION_TEMPLATE_NAME = prevTemplate;
  }
});

test('sendWhatsAppResolutionTemplate is optional and returns a clear failure when unset outside 24h window', async () => {
  const prevToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const prevPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const prevTemplate = process.env.WHATSAPP_RESOLUTION_TEMPLATE_NAME;

  process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
  delete process.env.WHATSAPP_RESOLUTION_TEMPLATE_NAME;

  try {
    const res = await sendWhatsAppResolutionTemplate('+15551234567', 'GRV-1001', 'Resolved test');
    assert.equal(res.ok, false);
    assert.equal(res.status, 'failed');
    assert.match(res.error, /WHATSAPP_RESOLUTION_TEMPLATE_NAME is not configured/);
  } finally {
    process.env.WHATSAPP_ACCESS_TOKEN = prevToken;
    process.env.WHATSAPP_PHONE_NUMBER_ID = prevPhoneId;
    process.env.WHATSAPP_RESOLUTION_TEMPLATE_NAME = prevTemplate;
  }
});

test('handleWebhookEvent reports processed:false cleanly in id_token_only mode even with valid HMAC', async () => {
  const prevSecret = process.env.WHATSAPP_APP_SECRET;
  const secret = 'meta-app-secret-xyz';
  process.env.WHATSAPP_APP_SECRET = secret;

  try {
    const payload = { object: 'whatsapp_business_account', entry: [] };
    const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
    const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const mock = createMockResponse();
    await handleWebhookEvent(
      {
        header: (name: string) => (name.toLowerCase() === 'x-hub-signature-256' ? sig : undefined),
        rawBody,
        body: payload,
      } as unknown as RawBodyRequest,
      mock.res
    );

    const result = mock.getResult();
    assert.equal(result.statusCode, 200);
    assert.equal((result.body as { processed?: boolean }).processed, false);
  } finally {
    process.env.WHATSAPP_APP_SECRET = prevSecret;
  }
});

test('isFirestorePermissionError detects gRPC code 7 and 403 permission errors', () => {
  assert.equal(isFirestorePermissionError({ code: 7, message: '7 PERMISSION_DENIED: Missing permissions' }), true);
  assert.equal(isFirestorePermissionError(new Error('HTTP 403 PERMISSION_DENIED')), true);
  assert.equal(isFirestorePermissionError(new Error('Network timeout')), false);
});

test('Netlify whatsapp-webhook function verifies GET challenge and raw-body POST HMAC signature', async () => {
  const prevToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const prevSecret = process.env.WHATSAPP_APP_SECRET;
  process.env.WHATSAPP_VERIFY_TOKEN = 'netlify-verify-token';
  process.env.WHATSAPP_APP_SECRET = 'netlify-app-secret';

  try {
    const getRes = await netlifyWebhookHandler(
      new Request(
        'https://demo.netlify.app/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=netlify-verify-token&hub.challenge=chal_42'
      )
    );
    assert.equal(getRes.status, 200);
    assert.equal(await getRes.text(), 'chal_42');

    const badPost = await netlifyWebhookHandler(
      new Request('https://demo.netlify.app/api/webhook/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' },
        body: '{"object":"whatsapp_business_account"}',
      })
    );
    assert.equal(badPost.status, 401);

    const validBody = '{"object":"whatsapp_business_account","entry":[]}';
    const sig =
      'sha256=' + crypto.createHmac('sha256', 'netlify-app-secret').update(validBody).digest('hex');
    const goodPost = await netlifyWebhookHandler(
      new Request('https://demo.netlify.app/api/webhook/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig },
        body: validBody,
      })
    );
    assert.equal(goodPost.status, 200);
  } finally {
    process.env.WHATSAPP_VERIFY_TOKEN = prevToken;
    process.env.WHATSAPP_APP_SECRET = prevSecret;
  }
});

test('Netlify whatsapp-notify enforces Bearer token and health function masks secrets', async () => {
  const unauthRes = await netlifyNotifyHandler(
    new Request('https://demo.netlify.app/api/whatsapp/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ complaintId: 'c1', ticketId: 'GRV-1001', customerPhone: '+15551234567', resolutionNotes: 'Done' }),
    })
  );
  assert.equal(unauthRes.status, 401);

  const healthRes = await netlifyHealthHandler(
    new Request('https://demo.netlify.app/api/health', { method: 'GET' })
  );
  assert.equal(healthRes.status, 200);
  const healthJson = (await healthRes.json()) as { ok: boolean; platform: string; firebaseProjectId: string };
  assert.equal(healthJson.ok, true);
  assert.equal(healthJson.platform, 'netlify');
  assert.equal(healthJson.firebaseProjectId, 'grievance-project-3c98a');
});
