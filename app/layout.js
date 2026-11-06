import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const metadata = {
  title: 'SME Tracker',
  description: 'A simple Nigerian SME expense, sales, customer and invoice tracker.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#12392e',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
