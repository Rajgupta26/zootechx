import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';
import { LoginBackdrop } from './backdrop';
import { Wordmark } from '@/components/layout/wordmark';

export const metadata: Metadata = { title: 'Sign in' };

function Proof({ figure, label }: { figure: string; label: string }) {
  return (
    <div>
      <p className="display text-[1.4rem]">{figure}</p>
      <p className="mt-0.5 text-xs text-primary-foreground/70">{label}</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    /*
      One surface, edge to edge — no inset round the outside, no seam down the
      middle. The brand side takes whatever width is going; the form side is
      capped, because a sign-in form adrift in half a wide monitor looks lost.
      At 1500px it used to be 352px of content sitting in a 797px column.
    */
    <div className="flex min-h-screen bg-background">
      <div className="relative isolate hidden flex-1 flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex xl:p-14">
        <LoginBackdrop />

        <Wordmark tone="light" height={24} />

        <div className="max-w-md">
          <h1 className="display text-[2rem] xl:text-[2.25rem]">
            Leads to invoices, without the paperwork in between
          </h1>
          <p className="mt-4 text-sm text-primary-foreground/85">
            Pipeline, delivery and marketing in one place — plus GST-correct
            billing that takes a client and an amount and does the rest.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-5 text-sm">
          <Proof figure="2" label="fields to invoice" />
          <Proof figure="6" label="roles supported" />
          <Proof figure="AES-256" label="vault encryption" />
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-col items-center justify-center bg-background px-6 py-12 lg:w-[44%] lg:max-w-[36rem] lg:px-10 xl:px-14">
        <div className="w-full max-w-[23rem]">
          {/* The brand panel is hidden on a phone, so the mark belongs here. */}
          <Wordmark height={24} className="mb-8 lg:hidden" />

          <h2 className="display text-[1.75rem]">Sign in</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Use your work email to reach your workspace.
          </p>

          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
