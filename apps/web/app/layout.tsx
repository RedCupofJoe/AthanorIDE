/** Root Next.js layout: fonts, global CSS, and document shell. */
import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";

import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

const sans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "AthanorIDE",
  description:
    "Visual workbench for sandboxed agents, harnesses, and MCP servers — typed graphs, validation, and export.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${sans.variable} antialiased font-[family-name:var(--font-sans)]`}>
        {children}
      </body>
    </html>
  );
}
