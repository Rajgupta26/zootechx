'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { addLeadNoteAction } from '@/server/actions/crm';
import { linkify } from '@/lib/linkify';

const MAX = 2000;

/** Compose a note. Paste a link and it becomes clickable on the timeline. */
export function NoteComposer({ leadId }: { leadId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    startTransition(async () => {
      const res = await addLeadNoteAction(leadId, { body: trimmed });
      if (!res.ok) {
        toast({ title: 'Could not add the note', description: res.error, variant: 'error' });
        return;
      }
      setBody('');
      toast({ title: 'Note added', variant: 'success' });
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="mb-4">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MAX}
        rows={3}
        placeholder="Add a note, or paste a link — a demo video, a deck, a drive folder…"
        aria-label="Add a note to this lead"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {body.length > MAX - 200 ? `${MAX - body.length} characters left` : 'Links become clickable.'}
        </p>
        <Button type="submit" size="sm" loading={pending} disabled={!body.trim()}>
          <StickyNote />
          Add note
        </Button>
      </div>
    </form>
  );
}

/**
 * Note text with its links made clickable.
 *
 * The href comes from `linkify`, which only ever emits http(s) URLs, and the
 * label is rendered as text so React escapes it. `noopener` keeps the opened
 * page from reaching back into this tab.
 */
export function NoteBody({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap break-words">
      {linkify(text).map((part, i) =>
        part.kind === 'link' ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline underline-offset-2 hover:opacity-80"
          >
            {part.label}
          </a>
        ) : (
          <span key={i}>{part.value}</span>
        )
      )}
    </p>
  );
}
