import type { Metadata } from "next";
import { IBM_Plex_Mono, Poiret_One, Space_Grotesk } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const deco = Poiret_One({
  variable: "--font-poiret",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "flightart",
  description: "Ambient flight art display",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${mono.variable} ${deco.variable} h-full antialiased`}
    >
      <body className="h-full bg-bg text-ink">{children}</body>
    </html>
  );
}
