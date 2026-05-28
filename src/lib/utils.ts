// lib/error-handlers.ts
import { Prisma } from "@prisma/client";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import logger from "@/lib/logger";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function handlePrismaError(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error({ code: error.code, message: error.message }, "Prisma error");

    switch (error.code) {
      case "P2002":
        return new Error("Entity already exists with this email.");
      case "P2025":
        return new Error("Record not found.");
      // Add more Prisma error codes as needed
      default:
        return new Error(`Database error: ${error.code}`);
    }
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    logger.error({ message: error.message }, "Prisma validation error");
    return new Error("Invalid input data format.");
  } else if (error instanceof Error) {
    // Handle regular Error objects
    logger.error({ message: error.message }, "Error");
    return error;
  } else if (typeof error === "string") {
    // Handle string errors
    logger.error({ message: error }, "Error");
    return new Error(error);
  }

  logger.error({ error }, "Unexpected error");
  return new Error("Operation failed! Please try again later.");
}

export function cleanFileName(fileName: string): string {
  return fileName
    .trim() // Remove leading/trailing spaces
    .replace(/[^a-zA-Z0-9._ ]/g, "") // Remove special characters except dot, underscore, and space
    .replace(/\s+/g, "-") // Replace spaces with dashes
    .toLowerCase(); // Convert to lowercase (optional)
}

export function calculateMonthsDuration(
  endDate: Date,
  startDate: Date,
): number {
  return Math.ceil(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) /
      (1000 * 60 * 60 * 24 * 30),
  );
}

export function getAppUrl(): string {
  const rawUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.URL ??
    process.env.DEPLOY_PRIME_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  if (!rawUrl) {
    return "";
  }

  try {
    const parsed = new URL(rawUrl);
    const origin = parsed.origin;
    const pathname = parsed.pathname.replace(/\/$/, "");

    if (!pathname || pathname === "/" || pathname === "/api/auth") {
      return origin;
    }

    return `${origin}${pathname}`;
  } catch {
    return rawUrl.replace(/\/api\/auth\/?$/, "").replace(/\/$/, "");
  }
}

export function getLoginUrl(path = "/"): string {
  const baseUrl =
    getAppUrl() ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${baseUrl}${normalizedPath}`;
}