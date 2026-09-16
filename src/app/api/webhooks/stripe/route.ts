import { NextResponse, type NextRequest } from 'next/server';
import { handlePaymentWebhook } from '@/lib/webhooks/handle-payment';

/** Stripe webhook. Signature is a timestamped HMAC over the raw body. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers.entries());
  const result = await handlePaymentWebhook('stripe', rawBody, headers);
  return NextResponse.json(result.body, { status: result.status });
}
