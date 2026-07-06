import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "bot-estudio",
  description: "Aplicación personal de estudio con repetición espaciada y asistente por PDF.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
