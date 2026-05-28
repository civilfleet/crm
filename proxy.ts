import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { getToken } from "next-auth/jwt";
import authConfig from "@/config/auth";

const { auth } = NextAuth(authConfig);

export const ROOT = "/";
export const PUBLIC_ROUTES = ["/"];
export const DEFAULT_REDIRECT = "/protected";

export default auth(async (req) => {
  const { nextUrl } = req;
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    cookieName:
      process.env.NODE_ENV === "production"
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
  });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const roles = (token?.roles as string[]) || [``];

  const isOrganization = roles.includes("Organization");
  const isTeam = roles.includes("Team");
  const isAdmin = roles.includes("Admin");

  if (isAdmin) {
    return NextResponse.next(); // Allow admins to access everything
  }

  if (isTeam && !isOrganization && !nextUrl.pathname.startsWith("/teams")) {
    return NextResponse.redirect(new URL("/teams", nextUrl));
  }

  if (
    isOrganization &&
    !isTeam &&
    !nextUrl.pathname.startsWith("/organizations")
  ) {
    return NextResponse.redirect(new URL("/organizations", nextUrl));
  }
});

export const config = {
  matcher: ["/admin/:path*", "/teams/:path*", "/organizations/:path*"],
};
