import type { MetadataRoute } from "next";
import { APP_NAME } from "@/constants/app";

/* The installed app's name and icons (docs/BRAND.md). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    start_url: "/",
    display: "standalone",
    theme_color: "#001F29",
    background_color: "#001F29",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
