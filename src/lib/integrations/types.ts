/**
 * Provider-agnostic integration contracts.
 *
 * Business logic only ever sees these interfaces. Swapping Razorpay for Stripe,
 * or SendGrid for SMTP, is an env var change — no billing code is touched.
 * Every provider ships a mock implementation so the full flow runs with zero
 * third-party accounts.
 */

export type Currency = 'INR' | 'USD';

// ---------- Payments ----------

export interface PaymentLinkRequest {
  invoiceId: string;
  invoiceNumber: string;
  /** Amount in minor units (paise / cents). */
  amountMinor: bigint;
  currency: Currency;
  description: string;
  customer: { name: string; email?: string | null; phone?: string | null };
  expiresAt?: Date;
  callbackUrl?: string;
  notes?: Record<string, string>;
}

export interface PaymentLinkResult {
  provider: string;
  /** The URL sent to the client. */
  url: string;
  /** Provider's id for the link, stored for reconciliation. */
  reference: string;
  expiresAt?: Date;
}

export interface WebhookVerification {
  valid: boolean;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  /** Present on payment-captured events. */
  payment?: {
    gatewayPaymentId: string;
    gatewayOrderId?: string;
    amountMinor: bigint;
    currency: Currency;
    invoiceReference?: string;
    paidAt: Date;
  };
  reason?: string;
}

export interface PaymentProvider {
  readonly name: string;
  readonly supportedCurrencies: readonly Currency[];
  createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLinkResult>;
  verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookVerification>;
  refund?(gatewayPaymentId: string, amountMinor: bigint): Promise<{ refundId: string }>;
}

// ---------- Email ----------

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
}

export interface EmailMessage {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
}

export interface SendResult {
  providerMessageId: string;
  provider: string;
  /** False means the caller should schedule a retry. */
  accepted: boolean;
  error?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<SendResult>;
}

// ---------- WhatsApp ----------

/**
 * Business-initiated WhatsApp messages REQUIRE a template approved by Meta.
 * Free-form text only works inside a 24-hour customer service window opened by
 * the customer messaging first. The adapter therefore takes a template name and
 * variables, never arbitrary prose. See docs/INTEGRATIONS.md.
 */
export interface WhatsAppTemplateMessage {
  to: string;
  templateName: string;
  languageCode?: string;
  /** Positional {{1}}, {{2}} ... substitutions in the approved template body. */
  bodyParams: string[];
  /** Public URL of a PDF to attach as the template header document. */
  documentUrl?: string;
  documentFilename?: string;
}

export interface WhatsAppProvider {
  readonly name: string;
  sendTemplate(message: WhatsAppTemplateMessage): Promise<SendResult>;
}

// ---------- Storage ----------

export interface StoredObject {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

export interface StorageProvider {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  /** Time-limited URL for private objects. */
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
