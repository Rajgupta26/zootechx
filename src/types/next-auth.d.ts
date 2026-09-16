import type { Role } from '@prisma/client';
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
      clientId: string | null;
    } & DefaultSession['user'];
  }

  interface User {
    role: Role;
    clientId?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: Role;
    clientId: string | null;
    sudoUntil?: string | null;
  }
}
