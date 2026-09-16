'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, FolderKanban, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/portal', label: 'Overview', icon: FolderKanban, exact: true },
  { href: '/portal/invoices', label: 'Invoices', icon: Receipt },
  { href: '/portal/documents', label: 'Documents', icon: FileText },
];

export function PortalNav() {
  const pathname = usePathname();

  return (
    <nav className="mx-auto max-w-6xl overflow-x-auto scrollbar-thin px-4 sm:px-6">
      <ul className="flex gap-1">
        {LINKS.map((link) => {
          const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          const Icon = link.icon;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
