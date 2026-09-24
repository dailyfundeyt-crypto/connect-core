import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeScript } from "@/components/theme-script";

export const metadata: Metadata = {
  metadataBase: new URL("https://connect.sh"),
  title: {
    default: "Connect — The self-hosted AI coworker workspace",
    template: "%s · Connect",
  },
  description:
    "Same intuitive experience as ChatGPT or Claude — running on your own infrastructure, with full control over data, agents, and an integrated real browser.",
  applicationName: "Connect",
  keywords: [
    "AI agents",
    "self-hosted",
    "coworker",
    "browser",
    "workspace",
    "Perplexity Comet",
    "Arc alternative",
    "open source",
  ],
  authors: [{ name: "Connect Team" }],
  openGraph: {
    type: "website",
    title: "Connect — The self-hosted AI coworker workspace",
    description:
      "Your own AI coworker. Self-hosted. With a real browser built in.",
    siteName: "Connect",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Connect — Self-hosted AI coworker",
    description: "Your own AI coworker. Self-hosted. With a real browser built in.",
  },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF8F3" },
    { media: "(prefers-color-scheme: dark)", color: "#09090B" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
          crossOrigin=""
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
