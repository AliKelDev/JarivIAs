import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jariv Agentic Portal",
  description: "Agentic assistant for email, calendar, and messaging actions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
