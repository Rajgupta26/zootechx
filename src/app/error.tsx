'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Wire this to your error tracker (Sentry, etc.) in production.
    console.error('Unhandled error:', error);
  }, [error]);

  const isAuth = error.message.includes('permission') || error.name === 'AuthorizationError';

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </div>
        <h1 className="text-lg font-semibold">
          {isAuth ? 'Access denied' : 'Something went wrong'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAuth ? error.message : 'An unexpected error occurred. Try again, or contact an administrator.'}
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>
        )}
        {!isAuth && (
          <Button className="mt-5" onClick={reset}>
            Try again
          </Button>
        )}
      </div>
    </main>
  );
}
