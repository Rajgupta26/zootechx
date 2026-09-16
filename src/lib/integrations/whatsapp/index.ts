import { randomUUID } from 'node:crypto';
import type { SendResult, WhatsAppProvider, WhatsAppTemplateMessage } from '../types';

/**
 * WhatsApp delivery.
 *
 * IMPORTANT CONSTRAINT: a business cannot send free-form WhatsApp text to a
 * client who hasn't messaged in the last 24 hours. Business-initiated messages
 * must use a template pre-approved by Meta, with a fixed body and positional
 * variables. That is why this interface takes a template name plus params
 * instead of a message string — the invoice dispatch flow depends on the
 * `invoice_dispatch_v1` template existing and being approved in the WhatsApp
 * Manager. See docs/INTEGRATIONS.md for the exact template text to submit.
 */

class MockWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'mock';

  async sendTemplate(message: WhatsAppTemplateMessage): Promise<SendResult> {
    const id = `mock_wa_${randomUUID()}`;
    console.info(
      `[whatsapp:mock] → ${message.to} | template=${message.templateName} | ` +
        `params=[${message.bodyParams.join(' | ')}]` +
        (message.documentUrl ? ` | doc=${message.documentFilename}` : '')
    );
    return { providerMessageId: id, provider: this.name, accepted: true };
  }
}

class MetaCloudProvider implements WhatsAppProvider {
  readonly name = 'meta';
  private readonly phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  private readonly accessToken = process.env.WHATSAPP_ACCESS_TOKEN ?? '';
  private readonly apiVersion = 'v21.0';

  async sendTemplate(message: WhatsAppTemplateMessage): Promise<SendResult> {
    const components: Record<string, unknown>[] = [];

    if (message.documentUrl) {
      components.push({
        type: 'header',
        parameters: [
          {
            type: 'document',
            document: {
              link: message.documentUrl,
              filename: message.documentFilename ?? 'invoice.pdf',
            },
          },
        ],
      });
    }

    if (message.bodyParams.length) {
      components.push({
        type: 'body',
        parameters: message.bodyParams.map((text) => ({ type: 'text', text })),
      });
    }

    const res = await fetch(
      `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: normalisePhone(message.to),
          type: 'template',
          template: {
            name: message.templateName,
            language: { code: message.languageCode ?? 'en' },
            components,
          },
        }),
      }
    );

    if (!res.ok) {
      return {
        providerMessageId: '',
        provider: this.name,
        accepted: false,
        error: `WhatsApp ${res.status}: ${await res.text()}`,
      };
    }

    const data = (await res.json()) as { messages?: { id: string }[] };
    return {
      providerMessageId: data.messages?.[0]?.id ?? '',
      provider: this.name,
      accepted: true,
    };
  }
}

/** WhatsApp wants E.164 without the leading '+'. Indian numbers get 91 prefixed. */
export function normalisePhone(phone: string, defaultCountryCode = '91'): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  return digits.replace(/^0+/, '');
}

export function getWhatsAppProvider(): WhatsAppProvider {
  switch ((process.env.WHATSAPP_PROVIDER ?? 'mock').toLowerCase()) {
    case 'meta':
      return process.env.WHATSAPP_ACCESS_TOKEN
        ? new MetaCloudProvider()
        : new MockWhatsAppProvider();
    default:
      return new MockWhatsAppProvider();
  }
}
