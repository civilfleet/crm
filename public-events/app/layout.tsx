import type { ReactNode } from "react";
import { Fraunces, IBM_Plex_Sans } from "next/font/google";
import "./style.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display" });
const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

export const metadata = {
  title: "Sea-Watch · Events",
  description:
    "Meet, learn, and take action. Explore public events from Sea-Watch.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable}`}>{children}</body>
    </html>
  );
}
