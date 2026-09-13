import type { ReactNode } from "react";
import { IBM_Plex_Sans, Brygada_1918 } from "next/font/google";
import "../globals.css";

const brygada = Brygada_1918({ subsets: ["latin-ext"], weight: ["700"], variable: "--font-brygada" });
const plex = IBM_Plex_Sans({ subsets: ["latin-ext"], weight: ["400", "500"], variable: "--font-plex" });

/** The admin views sit outside the localised site, so they own their own html. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${brygada.variable} ${plex.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
