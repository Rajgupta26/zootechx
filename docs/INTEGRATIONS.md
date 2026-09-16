# Integrations

Every external service sits behind an interface in
`src/lib/integrations/types.ts`. Business logic only ever sees that interface,
so swapping a provider is an environment-variable change and no billing code is
touched.

**Everything defaults to a working mock.** The full invoice → PDF → payment link
→ email → WhatsApp → webhook → `PAID` flow runs end to end with zero accounts.

---

## Payments

```bash
PAYMENTS_PROVIDER="auto"   # mock | razorpay | stripe | auto
```

`auto` routes INR to Razorpay and USD to Stripe, falling back to the mock for
anything unconfigured. This split isn't cosmetic — Razorpay international needs
separate activation, which is why selecting `razorpay` for a USD invoice raises
an explicit error rather than generating a link the client can't pay.

### Razorpay (INR)

```bash
RAZORPAY_KEY_ID="rzp_live_..."
RAZORPAY_KEY_SECRET="..."
RAZORPAY_WEBHOOK_SECRET="..."
```

In the Razorpay dashboard, add a webhook pointing at
`https://your-domain.com/api/webhooks/razorpay` and subscribe to
`payment.captured`, `payment_link.paid` and `order.paid`.

### Stripe (USD)

```bash
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

Endpoint: `https://your-domain.com/api/webhooks/stripe`, event
`checkout.session.completed`.

Test locally with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

### Why webhooks can be replayed safely

Two independent guards:

1. `WebhookEvent(provider, eventId)` is unique — a redelivered event short-circuits.
2. `Payment.gatewayPaymentId` is unique — even if the same payment arrives under
   a different event id, it can only be credited once.

A verified, well-formed event always returns `200`, because a non-2xx makes the
gateway retry forever. Genuine processing failures return `500` (so it *does*
retry) and record the reason on the event row.

---

## WhatsApp — read this before promising instant delivery

```bash
WHATSAPP_PROVIDER="meta"
WHATSAPP_PHONE_NUMBER_ID="..."
WHATSAPP_ACCESS_TOKEN="..."
WHATSAPP_TEMPLATE_INVOICE="invoice_dispatch_v1"
WHATSAPP_TEMPLATE_REMINDER="invoice_reminder_v1"
```

**A business cannot send free-form WhatsApp text to someone who hasn't messaged
it in the last 24 hours.** Business-initiated messages must use a template
pre-approved by Meta, with fixed body text and positional variables. This is a
platform rule, not an implementation choice — which is why the adapter takes a
template name plus parameters rather than a message string.

### Submit this template in WhatsApp Manager

**Name:** `invoice_dispatch_v1`
**Category:** Utility
**Header:** Document
**Body:**

```
Hi {{1}}, your invoice {{2}} for {{3}} is ready and due on {{4}}.
Pay securely here: {{5}}
```

The dispatcher passes, in order: client name, invoice number, formatted amount,
due date, payment link — and attaches the PDF as the header document via a
signed URL valid for 7 days.

Approval typically takes minutes to a few hours. Until it's approved, sends fail
and land in the retry queue, then dead-letter after 5 attempts. The invoice
detail page shows the failure reason in its delivery log.

Other providers (Twilio, Gupshup, AiSensy) can be added by implementing
`WhatsAppProvider` — the same template constraint applies to all of them,
because it comes from Meta.

---

## Email

```bash
EMAIL_PROVIDER="sendgrid"   # mock | sendgrid | smtp
SENDGRID_API_KEY="SG..."
EMAIL_FROM="billing@your-domain.com"
EMAIL_FROM_NAME="Your Company Billing"
```

Or SMTP:

```bash
EMAIL_PROVIDER="smtp"
SMTP_HOST="smtp.your-provider.com"
SMTP_PORT="587"
SMTP_USER="..."
SMTP_PASSWORD="..."
```

**Set up SPF and DKIM on your sending domain.** Invoices from an unauthenticated
domain go to spam, and you'll spend weeks blaming the app.

### Retries

Sends are persisted before they're attempted. Failures back off at 1, 5, 15, 60
and 240 minutes, then dead-letter. `/api/cron/dispatch` drains the queue; run it
every few minutes.

---

## Storage

```bash
STORAGE_PROVIDER="s3"       # local | s3 | r2
S3_ENDPOINT=""              # set for Cloudflare R2
S3_REGION="ap-south-1"
S3_BUCKET="xcc-crm"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
```

`local` writes under `./storage` and is the development default.
**Do not use it in production on Vercel or Lambda** — the filesystem is
ephemeral and invoice PDFs would vanish between requests.

Keys are laid out `invoices/<year>/<month>/<number>.pdf` so the bucket stays
browsable.

---

## Marketing (not yet wired)

Campaign metrics and creatives are currently entered manually; `Campaign` has
`externalId` and `lastSyncedAt` columns ready for a real sync, and
`syncCampaignLeadAction` is idempotent on `Lead.externalId`, so a Meta Lead Ads
webhook can be pointed at it without risking duplicates.

Wiring the Ads APIs properly means OAuth per brand, token refresh, and a
scheduled metrics pull — a meaningful piece of work rather than an afternoon.

---

## PDF generation

`@react-pdf/renderer`, chosen because it runs on every deployment target
including serverless. Headless Chrome produces prettier output but needs a
bundled `chromium-min` on Vercel and adds ~50MB to the deployment.
