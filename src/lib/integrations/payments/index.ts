import type { Currency, PaymentProvider } from '../types';
import { MockPaymentProvider } from './mock';
import { RazorpayProvider } from './razorpay';
import { StripeProvider } from './stripe';

/**
 * Provider selection.
 *
 * INR invoices route to Razorpay and USD to Stripe when both are configured —
 * that split is the practical reason multi-currency needs two gateways rather
 * than one. Anything unconfigured falls back to the mock so the app always runs.
 */
export function getPaymentProvider(currency: Currency = 'INR'): PaymentProvider {
  const configured = (process.env.PAYMENTS_PROVIDER ?? 'mock').toLowerCase();

  if (configured === 'mock') return new MockPaymentProvider();

  if (configured === 'auto') {
    if (currency === 'USD' && process.env.STRIPE_SECRET_KEY) return new StripeProvider();
    if (currency === 'INR' && process.env.RAZORPAY_KEY_ID) return new RazorpayProvider();
    return new MockPaymentProvider();
  }

  if (configured === 'razorpay') {
    if (currency === 'USD') {
      // Razorpay international needs explicit activation; be loud rather than
      // silently generating a link the client cannot pay.
      throw new Error(
        'Razorpay is selected but this invoice is in USD. Set PAYMENTS_PROVIDER=auto and configure Stripe for export invoices.'
      );
    }
    return process.env.RAZORPAY_KEY_ID ? new RazorpayProvider() : new MockPaymentProvider();
  }

  if (configured === 'stripe') {
    return process.env.STRIPE_SECRET_KEY ? new StripeProvider() : new MockPaymentProvider();
  }

  return new MockPaymentProvider();
}

/** Resolve a provider by name — used by webhook handlers. */
export function getProviderByName(name: string): PaymentProvider {
  switch (name.toLowerCase()) {
    case 'razorpay':
      return new RazorpayProvider();
    case 'stripe':
      return new StripeProvider();
    default:
      return new MockPaymentProvider();
  }
}

export * from '../types';
