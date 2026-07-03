import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://oppscore.app";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "OppScore — Opportunities you're actually competitive for",
    template: "%s · OppScore",
  },
  description:
    "OppScore discovers scholarships, fellowships, research programs, grants, and competitions from official sources, verifies every application link, and ranks each one by how competitive you are.",
  openGraph: {
    type: "website",
    siteName: "OppScore",
    title: "OppScore — Opportunities you're actually competitive for",
    description:
      "Verified scholarships, fellowships, research programs, grants, and competitions — matched and scored against your profile.",
    url: APP_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "OppScore — Opportunities you're actually competitive for",
    description:
      "Verified scholarships, fellowships, research programs, grants, and competitions — matched and scored against your profile.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  );
}
