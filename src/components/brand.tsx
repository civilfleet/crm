import Image from "next/image";
import { APP_NAME } from "@/constants/app";

/*
  The sea-hive logo (docs/BRAND.md). The yellow logo is made for Sea-Watch
  navy, so on the light theme's pages only the small icon (its own navy
  square) appears; the full logo sits on a navy panel.
*/

/** The small icon and the app's name, linking home. */
export const BrandHomeLink = () => (
  <a href="/" className="flex items-center gap-2 font-medium">
    <Image
      src="/brand/sea-hive-icon-small.svg"
      alt=""
      width={28}
      height={28}
      unoptimized
      priority
    />
    {APP_NAME}
  </a>
);

/** The full logo on navy, beside the login form on wide screens. */
export const BrandPanel = () => (
  <div className="hidden items-center justify-center bg-[#001F29] p-10 lg:flex">
    <Image
      src="/brand/sea-hive-logo-horizontal-transparent.svg"
      alt="sea-hive"
      width={751}
      height={272}
      unoptimized
      priority
      className="h-auto w-full max-w-md"
    />
  </div>
);
