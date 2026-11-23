import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleWebhookEvent, handleWebhookVerify, type RawBodyRequest } from '../server/webhookHandler.ts';

/**
 * Serverless-compatible Meta WhatsApp Cloud API webhook entrypoint (Vercel / Node HTTP).
 * Disables automatic body parsing so exact raw bytes can be verified against X-Hub-Signature-256.
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: IncomingMessage & { query?: Record<string, string> }, res: ServerResponse) {
  if (req.method === 'GET') {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      query[k] = v;
    });
    const expressLikeReq = Object.assign(req, { query }) as unknown as RawBodyRequest;
    const expressLikeRes = wrapNodeResponse(res);
    handleWebhookVerify(expressLikeReq, expressLikeRes);
    return;
  }

  if (req.method === 'POST') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const rawBody = Buffer.concat(chunks);
    let parsedBody: unknown = {};
    try {
      parsedBody = JSON.parse(rawBody.toString('utf8'));
    } catch {
      parsedBody = {};
    }

    const expressLikeReq = Object.assign(req, {
      rawBody,
      body: parsedBody,
      header: (name: string) => {
        const val = req.headers[name.toLowerCase()];
        return Array.isArray(val) ? val[0] : val;
      },
    }) as unknown as RawBodyRequest;

    await handleWebhookEvent(expressLikeReq, wrapNodeResponse(res));
    return;
  }

  res.statusCode = 405;
  res.end('Method Not Allowed');
}

function wrapNodeResponse(res: ServerResponse) {
  return {
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    send(body: string) {
      res.end(body);
    },
    json(payload: unknown) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
    },
  } as unknown as import('express').Response;
}
