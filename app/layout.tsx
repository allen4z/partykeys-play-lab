import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#180b26",
};

export async function generateMetadata(): Promise<Metadata> {
  // Static export: og image URL is fixed to the production domain.
  const image = "https://op1.popumusic.cn/og.png";
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
      <body>{children}</body>
    </html>
  );
}
