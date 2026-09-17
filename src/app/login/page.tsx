import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';
import { LoginBackdrop } from './backdrop';
import { Wordmark } from '@/components/layout/wordmark';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen gap-3 bg-canvas p-0 lg:p-3">
      {/* Brand panel */}
      <div className="relative isolate hidden w-1/2 flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:rounded-card">
        <LoginBackdrop />

        <Wordmark tone="light" height={26} />

        <div className="max-w-md">
          <h1 className="display text-[2.1rem]">
            Leads to invoices, without the paperwork in between
          </h1>
          <p className="mt-4 text-primary-foreground/85">
            Pipeline, delivery and marketing in one place — plus GST-correct billing
            that takes a client and an amount and does the rest.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6 text-sm">
          <div>
            <p className="text-2xl font-semibold">2</p>
            <p className="text-primary-foreground/70">fields to invoice</p>
          </div>
          <div>
            <p className="text-2xl font-semibold">6</p>
            <p className="text-primary-foreground/70">roles supported</p>
          </div>
          <div>
            <p className="text-2xl font-semibold">AES-256</p>
            <p className="text-primary-foreground/70">vault encryption</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex w-full flex-col items-center justify-center bg-background px-6 py-12 lg:w-1/2 lg:rounded-card">
        <div className="w-full max-w-sm">
          {/* The brand panel is hidden on a phone, so the mark belongs here. */}
          <Wordmark height={24} className="mb-8 lg:hidden" />

          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Use your work email to access your workspace.
          </p>

          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
