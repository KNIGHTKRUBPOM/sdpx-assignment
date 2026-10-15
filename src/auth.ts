import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { and, eq, isNull, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { database } from "./db/client";
import { users } from "./db/schema";
import { safeEmail } from "./domain/policy";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async signIn({ profile, account }) {
      const google = profile as
        | {
            email?: string;
            email_verified?: boolean;
            hd?: string;
            sub?: string;
            name?: string;
          }
        | undefined;
      if (
        account?.provider !== "google" ||
        !google?.email_verified ||
        !google.email ||
        !google.sub
      )
        return false;
      const email = safeEmail(google.email),
        domain = email.split("@")[1];
      if (domain !== "gmail.com" && google.hd !== domain) return false;
      const db = database();
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, email));
      if (
        existing[0]?.googleSubject &&
        existing[0].googleSubject !== google.sub
      )
        return false;
      await db
        .insert(users)
        .values({
          id: randomUUID(),
          email,
          name: google.name || email.split("@")[0],
          googleSubject: google.sub,
        })
        .onConflictDoUpdate({
          target: users.email,
          set: {
            googleSubject: google.sub,
            name: google.name || email.split("@")[0],
          },
          setWhere: or(
            isNull(users.googleSubject),
            eq(users.googleSubject, google.sub),
          ),
        });
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account && profile?.email) {
        const [user] = await database()
          .select()
          .from(users)
          .where(
            and(
              eq(users.email, safeEmail(profile.email)),
              eq(users.googleSubject, account.providerAccountId),
            ),
          );
        if (user) {
          token.userId = user.id;
          token.email = user.email;
          token.name = user.name;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = String(token.userId ?? "");
      return session;
    },
  },
  logger: {
    error(code) {
      console.error(JSON.stringify({ event: "auth_error", code }));
    },
    warn(code) {
      console.warn(JSON.stringify({ event: "auth_warning", code }));
    },
    debug() {},
  },
};
