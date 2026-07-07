import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NoteBooks-Science',
  description: 'A structured knowledge system for students and educators',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
  },
};

// This layout wraps all Next.js routes. The root static HTML is served directly 
// via rewrites in next.config.js, so this only applies to /api routes and future dynamic pages.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
