import "./globals.css";

export const metadata = {
  title: "SME Tracker — Sales, Expenses & Invoices",
  description: "Simple expense & invoice tracker for Nigerian small businesses",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}