import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe half of the auth config.
 *
 * Middleware runs on the edge runtime, where bcrypt and Prisma cannot run.
 * So the provider list (which needs both) lives in auth.ts, and only the
 * callbacks and page config live here, where middleware can import them.
 */
export const authConfig = {
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 8, // 8 hours
    updateAge: 60 * 30,
  },
  trustHost: true,
  providers: [], // populated in auth.ts
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role;
        token.clientId = (user as { clientId?: string | null }).clientId ?? null;
        token.name = user.name;
        token.email = user.email;
      }
      // `update()` from the client refreshes sudo state without a re-login.
      if (trigger === 'update' && session?.sudoUntil) {
        token.sudoUntil = session.sudoUntil;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as never;
        session.user.clientId = (token.clientId as string | null) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
