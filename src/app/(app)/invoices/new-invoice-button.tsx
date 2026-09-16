'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuickInvoiceModal } from '@/components/billing/quick-invoice-modal';

export function NewInvoiceButton({ clientId }: { clientId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        New invoice
      </Button>
      <QuickInvoiceModal open={open} onOpenChange={setOpen} defaultClientId={clientId} />
    </>
  );
}
