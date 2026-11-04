import localFont from "next/font/local";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "../site-chrome";
import "./style.css";

const inter = localFont({
  src: [
    {
      path: "../public/brand/inter-regular-latin.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/brand/inter-bold-latin.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-body",
  display: "swap",
});

export const metadata = {
  title: "Sea-Watch · Events",
  description:
    "Meet, learn, and take action. Explore public events from Sea-Watch.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
