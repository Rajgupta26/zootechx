import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <FileQuestion className="h-5 w-5 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page does not exist, or you do not have access to it.
        </p>
        <Button className="mt-5" asChild>
          <Link href="/">Go back</Link>
        </Button>
      </div>
    </main>
  );
}
