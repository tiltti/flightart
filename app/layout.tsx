import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Poiret_One, Space_Grotesk } from "next/font/google";
import ServiceWorker from "@/components/ServiceWorker";
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
  description: "The aircraft passing overhead, one at a time.",
  appleWebApp: { capable: true, title: "flightart", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#05080c",
  width: "device-width",
  initialScale: 1,
  // the display is edge to edge; let it run under the notch
  viewportFit: "cover",
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
      <body className="h-full bg-bg text-ink">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
