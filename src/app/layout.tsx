import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

/** Geometric grotesque, matching the reference's display and UI type. */
const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'XCC CRM', template: '%s · XCC CRM' },
  description: 'CRM, operations, marketing and project delivery with automated GST billing.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#adb9b1' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0f12' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={sans.variable}>
      <body className="font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SessionProvider>
            <ToastProvider>{children}</ToastProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
