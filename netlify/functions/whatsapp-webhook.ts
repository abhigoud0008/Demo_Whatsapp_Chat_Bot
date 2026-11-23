import {
  processWebhookPost,
  verifyWebhookChallenge,
} from '../../server/webhookHandler.ts';

/**
 * Netlify Serverless Function (v2 Web Request/Response):
 * - GET: Meta WhatsApp webhook subscription verification (hub.verify_token + hub.challenge)
 * - POST: Raw-body X-Hub-Signature-256 verification + incoming WhatsApp grievance processing
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const result = verifyWebhookChallenge({
      mode: url.searchParams.get('hub.mode'),
      token: url.searchParams.get('hub.verify_token'),
      challenge: url.searchParams.get('hub.challenge'),
    });
    return new Response(result.body, {
      status: result.status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  if (req.method === 'POST') {
    const rawBuffer = Buffer.from(await req.arrayBuffer());
    let parsedBody: unknown = {};
    try {
      parsedBody = JSON.parse(rawBuffer.toString('utf8'));
    } catch {
      return Response.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    }

    const result = await processWebhookPost({
      rawBody: rawBuffer,
      signatureHeader: req.headers.get('x-hub-signature-256') ?? undefined,
      parsedBody,
    });

    return Response.json(result.body, { status: result.status });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
