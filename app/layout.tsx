import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BRISAM | Servicios Integrales de Mantenimiento",
  description:
    "Mantenimiento integral para empresas, restaurantes, comercios e industria.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png"
  }
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-white text-zinc-900 antialiased">
        {children}
      </body>
    </html>
  );
}
