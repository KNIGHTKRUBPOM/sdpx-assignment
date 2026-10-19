import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { and, eq, isNull, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { database } from "./db/client";
import { users } from "./db/schema";
import { safeEmail } from "./domain/policy";
import { demoAccounts, demoEnabled } from "./demo/config";

const localDemo = demoEnabled();

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: localDemo ? [CredentialsProvider({
    id: "demo", name: "บัญชีสาธิต", credentials: { email: { label: "บัญชีสาธิต", type: "text" } },
    async authorize(credentials) {
      if (!demoEnabled() || !demoAccounts.some((a) => a.email === credentials?.email)) return null;
      const [user] = await database().select().from(users).where(eq(users.email, credentials!.email));
      return user && !user.googleSubject ? { id: user.id, email: user.email, name: user.name } : null;
    },
  })] : [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async signIn({ profile, account }) {
      if (account?.provider === "demo") return demoEnabled();
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
    async jwt({ token, account, profile, user }) {
      if (account?.provider === "demo") {
        if (!demoEnabled() || !user?.email || !demoAccounts.some((a) => a.email === user.email)) return {};
        return { ...token, userId: user.id, email: user.email, name: user.name, localDemo: true };
      }
      if (token.localDemo && !demoEnabled()) return {};
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
