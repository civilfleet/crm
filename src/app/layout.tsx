import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";

import { Inter } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeScript } from "@/components/theme-script";
import { Toaster } from "@/components/ui/toaster";
import { APP_NAME } from "@/constants/app";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: "A funding manager application.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The head script sets the theme class before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <NextTopLoader color="#2563eb" showSpinner={false} />
          <main>
            <div className=" w-full">{children}</div>
          </main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
