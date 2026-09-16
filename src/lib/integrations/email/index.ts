import { randomUUID } from 'node:crypto';
import type { EmailMessage, EmailProvider, SendResult } from '../types';

/** Writes to the server log and always succeeds — the default in development. */
class MockEmailProvider implements EmailProvider {
  readonly name = 'mock';

  async send(message: EmailMessage): Promise<SendResult> {
    const id = `mock_email_${randomUUID()}`;
    console.info(
      `[email:mock] → ${message.to} | ${message.subject} | ` +
        `${message.attachments?.length ?? 0} attachment(s) | id=${id}`
    );
    return { providerMessageId: id, provider: this.name, accepted: true };
  }
}

class SendGridProvider implements EmailProvider {
  readonly name = 'sendgrid';
  private readonly apiKey = process.env.SENDGRID_API_KEY ?? '';

  async send(message: EmailMessage): Promise<SendResult> {
    const body = {
      personalizations: [
        {
          to: [{ email: message.to }],
          cc: message.cc?.map((email) => ({ email })),
        },
      ],
      from: {
        email: process.env.EMAIL_FROM ?? 'no-reply@example.com',
        name: process.env.EMAIL_FROM_NAME ?? 'XCC',
      },
      reply_to: message.replyTo ? { email: message.replyTo } : undefined,
      subject: message.subject,
      content: [
        ...(message.text ? [{ type: 'text/plain', value: message.text }] : []),
        { type: 'text/html', value: message.html },
      ],
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        type: a.contentType,
        disposition: 'attachment',
        content: Buffer.isBuffer(a.content)
          ? a.content.toString('base64')
          : Buffer.from(a.content).toString('base64'),
      })),
    };

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      // Returning accepted:false (rather than throwing) lets the retry queue
      // decide; a 4xx from SendGrid is usually permanent, a 5xx is not.
      return {
        providerMessageId: '',
        provider: this.name,
        accepted: false,
        error: `SendGrid ${res.status}: ${error}`,
      };
    }

    return {
      providerMessageId: res.headers.get('x-message-id') ?? '',
      provider: this.name,
      accepted: true,
    };
  }
}

/**
 * SMTP via nodemailer, loaded dynamically so it stays out of the bundle unless
 * SMTP is the selected provider.
 */
class SmtpProvider implements EmailProvider {
  readonly name = 'smtp';

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const nodemailer = await import('nodemailer');
      const transport = nodemailer.default.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT ?? 587) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      });

      const info = await transport.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME ?? 'XCC'}" <${process.env.EMAIL_FROM}>`,
        to: message.to,
        cc: message.cc,
        replyTo: message.replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });

      return { providerMessageId: info.messageId, provider: this.name, accepted: true };
    } catch (err) {
      return {
        providerMessageId: '',
        provider: this.name,
        accepted: false,
        error: (err as Error).message,
      };
    }
  }
}

export function getEmailProvider(): EmailProvider {
  switch ((process.env.EMAIL_PROVIDER ?? 'mock').toLowerCase()) {
    case 'sendgrid':
      return process.env.SENDGRID_API_KEY ? new SendGridProvider() : new MockEmailProvider();
    case 'smtp':
      return process.env.SMTP_HOST ? new SmtpProvider() : new MockEmailProvider();
    default:
      return new MockEmailProvider();
  }
}
