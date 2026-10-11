import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'IronLog AI',
  description: 'AI-driven fitness and macro tracker',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'IronLog',
  },
};

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark bg-zinc-950 text-zinc-100">
      <body className="min-h-screen pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] antialiased select-none">
        {children}
      </body>
    </html>
  );
}