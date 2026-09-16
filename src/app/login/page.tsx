import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Zap } from 'lucide-react';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/15">
            <Zap className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">XCC CRM</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Leads to invoices, without the paperwork in between.
          </h1>
          <p className="mt-4 text-primary-foreground/80">
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
      <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">XCC CRM</span>
          </div>

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
