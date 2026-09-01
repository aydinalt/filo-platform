import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Filo Platform V1.28.20",
  description: "Çok şirketli sahiplik, telemetri, güvenli iş akışları, kullanıcı yetkileri ve Türkçe-İngilizce operasyon yönetimini birleştiren Filo Platform.",
  applicationName: "Filo Platform",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body>{children}</body></html>;
}
