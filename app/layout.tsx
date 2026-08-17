import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#180b26",
};

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  const title = "PartyKeys Play Lab — 音乐密码网页乐器";
  const description = "连接 PartyKeys 即刻演奏，以四层钢琴音源与同步灯光探索你的声音。";
  return {
    title,
    description,
    applicationName: "PartyKeys Play",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "PartyKeys Play", statusBarStyle: "black-translucent" },
    icons: { icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icon-512.png", sizes: "512x512", type: "image/png" }], shortcut: "/brand-logo.png", apple: "/apple-touch-icon.png" },
    openGraph: { title, description, type: "website", images: [{ url: image, width: 1731, height: 909, alt: "PartyKeys Play Lab purple virtual instrument" }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${geist.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
