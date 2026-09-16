import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from './db';
import { authConfig } from './auth.config';
import { audit } from './audit';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });

        // Always run a hash comparison so a missing user and a wrong password
        // take the same time — otherwise the response time enumerates accounts.
        const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
        const ok = await bcrypt.compare(password, hash);

        if (!user || !ok || user.deletedAt) return null;
        if (user.status === 'SUSPENDED') {
          throw new Error('Your account has been suspended. Contact an administrator.');
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        await audit({
          actorId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          action: 'auth.login',
          entity: 'user',
          entityId: user.id,
          summary: `${user.name} signed in`,
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          clientId: user.clientId,
          image: user.avatarUrl,
        };
      },
    }),
  ],
});

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
