import { NextResponse, type NextRequest } from 'next/server';
import { handlePaymentWebhook } from '@/lib/webhooks/handle-payment';

/**
 * Razorpay webhook.
 * The raw body is required byte-for-byte for signature verification, so it is
 * read as text before any JSON parsing.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers.entries());
  const result = await handlePaymentWebhook('razorpay', rawBody, headers);
  return NextResponse.json(result.body, { status: result.status });
}
