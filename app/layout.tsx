import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Orbitron,
  Chakra_Petch,
  Share_Tech_Mono,
} from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Centinela: display / marca / números grandes
const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
});

// Centinela: texto de UI
const chakraPetch = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"], // TODO Carlos: ¿por qué ESTA fuente sí pide `weight` y Orbitron no? (pista: probá quitarlo y leé el error)
});

// Centinela: readouts tipo HUD
const shareTechMono = Share_Tech_Mono({
  variable: "--font-share-tech",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Sentinel — Grupo del Llano", // ← era "Create Next App"
  description: "Control operacional de inventario y ventas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es" // ← era "en"
      className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} ${chakraPetch.variable} ${shareTechMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
