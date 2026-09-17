import Link from 'next/link';
import { ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Rendered with a 403 when a signed-in user opens a page their role does not
 * cover. Distinct from the error boundary on purpose: nothing has gone wrong,
 * and saying "something went wrong" to someone who simply lacks a permission
 * sends them to ask why the system is broken.
 */
export default function Forbidden() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-card border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <ShieldOff className="h-5 w-5 text-muted-foreground" />
        </div>
        <h1 className="display text-xl">You do not have access to this page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your role does not cover it. If you need it, ask an administrator to
          change your role or grant you access to the record.
        </p>
        <Button className="mt-5" asChild>
          <Link href="/dashboard">Back to the dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
