import { getIntegrationStatus } from '../../server/webhookHandler.ts';

/**
 * Netlify Serverless Function returning live backend integration readiness (never exposes secrets).
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  return Response.json(
    {
      ok: true,
      platform: 'netlify',
      ...getIntegrationStatus(),
    },
    { status: 200 }
  );
}
