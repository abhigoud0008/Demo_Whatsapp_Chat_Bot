import { processAuthLogin } from '../../server/authHandler.ts';

/**
 * Netlify Serverless Function for secure server-side username resolution & credential verification.
 * Never exposes the admin directory or username->email map to unauthenticated clients.
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

  const result = await processAuthLogin({
    body: parsedBody,
    clientIp,
  });

  return Response.json(result.body, { status: result.status });
}
