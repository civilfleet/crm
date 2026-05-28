import type { NextAuthConfig } from "next-auth";

// Notice this is only an object, not a full Auth.js instance
export default {
  providers: [],
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: "/",
    signOut: "/",
    error: "/",
  },
} satisfies NextAuthConfig;
