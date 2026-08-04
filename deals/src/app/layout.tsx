import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deals",
  description: "Sponsorship and partnership deals, ANZ and global, ranked by size and recency.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
