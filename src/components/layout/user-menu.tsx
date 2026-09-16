'use client';

import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { LogOut, Settings, ShieldCheck } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { initials } from '@/lib/utils';
import { ROLE_LABELS } from '@/lib/rbac';
import type { Role } from '@prisma/client';

export function UserMenu({ name, email, role }: { name: string; email: string; role: Role }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-80" aria-label="Account menu">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
          <Badge variant="secondary" className="mt-2">
            <ShieldCheck className="mr-1 h-3 w-3" />
            {ROLE_LABELS[role]}
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {role !== 'CLIENT' && (
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings />
              Settings
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-destructive focus:text-destructive"
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
