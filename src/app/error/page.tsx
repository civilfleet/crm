"use client";

import { APP_NAME } from "@/constants/app";

function ErrorPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="/" className="flex items-center gap-2 font-medium">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground"></div>
            {APP_NAME}
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Error</h1>
            <p className="text-sm text-muted-foreground">
              An error occurred while logging in. Please try again.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ErrorPage;