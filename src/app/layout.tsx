import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rentz",
  description: "Rentz clasic, în 3 sau 4 prieteni, pe telefon.",
  applicationName: "Rentz",
  // Not auto-prefixed with basePath, hence the explicit "/rentz" (Turbopack also does not prefix apple-icon.tsx).
  icons: {
    icon: { url: "/rentz/favicon.ico", sizes: "48x48", type: "image/x-icon" },
    apple: { url: "/rentz/pwa-icon/apple", sizes: "180x180", type: "image/png" },
  },
  appleWebApp: { capable: true, title: "Rentz", statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f5" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ro" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
