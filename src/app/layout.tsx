import type { Metadata } from "next";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";
import "./globals.css";

const displayFont = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://herogrid.org"),
  title: "HeroGrid — Dota 2 Hero Grid Maker",
  description: "Build and export Dota 2 hero grid layouts in your browser.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "HeroGrid — Dota 2 Hero Grid Maker",
    description: "Build and export Dota 2 hero grid layouts in your browser.",
    url: "https://herogrid.org",
    siteName: "HeroGrid",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${displayFont.variable} ${bodyFont.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
