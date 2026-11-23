import { processAdminNotify } from '../../server/webhookHandler.ts';

/**
 * Protected Netlify Serverless Function for dispatching customer resolution notifications.
 * Verifies the Firebase ID Token and checks authorized admin role server-side.
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  let parsedBody: unknown = {};
  try {
    parsedBody = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const result = await processAdminNotify({
    authHeader: req.headers.get('authorization'),
    body: parsedBody,
  });

  return Response.json(result.body, { status: result.status });
}
