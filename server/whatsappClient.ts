import type { NotificationDeliveryStatus } from '../src/shared/types.ts';

export interface WhatsAppSendResult {
  ok: boolean;
  status: NotificationDeliveryStatus;
  messageId: string;
  error: string;
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() &&
      process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  );
}

export function isWebhookSecurityConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_VERIFY_TOKEN?.trim() &&
      process.env.WHATSAPP_APP_SECRET?.trim()
  );
}

export function isResolutionTemplateConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_RESOLUTION_TEMPLATE_NAME?.trim());
}

function normalizeGraphRecipient(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

/**
 * Sends a free-form WhatsApp text service message (allowed only within 24h customer-service window).
 * Never marks status as 'delivered' merely because Meta accepted the HTTP request; returns 'accepted_by_meta'.
 */
export async function sendWhatsAppTextMessage(
  toPhone: string,
  bodyText: string
): Promise<WhatsAppSendResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

  if (!accessToken || !phoneNumberId) {
    return {
      ok: false,
      status: 'not_connected',
      messageId: '',
      error: 'WhatsApp Cloud API credentials (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) are not configured.',
    };
  }

  const recipient = normalizeGraphRecipient(toPhone);
  const endpoint = `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'text',
        text: {
          preview_url: false,
          body: bodyText,
        },
      }),
    });

    const data = (await response.json()) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number };
    };

    if (!response.ok) {
      return {
        ok: false,
        status: 'failed',
        messageId: '',
        error: data.error?.message || `Meta Graph API returned HTTP ${response.status}`,
      };
    }

    const messageId = data.messages?.[0]?.id ?? '';
    return {
      ok: true,
      status: 'accepted_by_meta',
      messageId,
      error: '',
    };
  } catch (err) {
    return {
      ok: false,
      status: 'failed',
      messageId: '',
      error: err instanceof Error ? err.message : 'Network error calling Meta Graph API',
    };
  }
}

/**
 * Sends an approved Meta Utility Template message outside the 24-hour customer-service window.
 * Optional for initial testing within the 24h customer-service window.
 */
export async function sendWhatsAppResolutionTemplate(
  toPhone: string,
  ticketId: string,
  resolutionNotes: string
): Promise<WhatsAppSendResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const templateName = process.env.WHATSAPP_RESOLUTION_TEMPLATE_NAME?.trim() || '';
  const languageCode = process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || 'en_US';

  if (!accessToken || !phoneNumberId) {
    return {
      ok: false,
      status: 'not_connected',
      messageId: '',
      error: 'WhatsApp Cloud API credentials are not configured.',
    };
  }

  if (!templateName) {
    return {
      ok: false,
      status: 'failed',
      messageId: '',
      error:
        'Customer is outside the 24-hour WhatsApp service window and optional WHATSAPP_RESOLUTION_TEMPLATE_NAME is not configured. Ask the customer to message your WhatsApp number to reopen the 24-hour window, or set an approved Meta utility template name.',
    };
  }

  const recipient = normalizeGraphRecipient(toPhone);
  const endpoint = `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: ticketId },
                { type: 'text', text: resolutionNotes.slice(0, 500) },
              ],
            },
          ],
        },
      }),
    });

    const data = (await response.json()) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return {
        ok: false,
        status: 'failed',
        messageId: '',
        error: data.error?.message || `Meta Graph API template error HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      status: 'accepted_by_meta',
      messageId: data.messages?.[0]?.id ?? '',
      error: '',
    };
  } catch (err) {
    return {
      ok: false,
      status: 'failed',
      messageId: '',
      error: err instanceof Error ? err.message : 'Network error sending WhatsApp template',
    };
  }
}
