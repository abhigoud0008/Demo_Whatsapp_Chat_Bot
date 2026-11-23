import { processPasswordResetRequest } from '../../server/authHandler.ts';

/**
 * Netlify Serverless Function for rate-limited password reset via verified admin email.
 * Always returns a generic confirmation message to prevent email enumeration.
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  let parsedBody: unknown = {};
  try {
    parsedBody = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const clientIp =
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';

  const result = await processPasswordResetRequest({
    body: parsedBody,
    clientIp,
  });

  return Response.json(result.body, { status: result.status });
}
