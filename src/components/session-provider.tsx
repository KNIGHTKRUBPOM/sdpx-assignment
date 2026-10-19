"use client";

import { SessionProvider } from "next-auth/react";

// Keep session polling separate from the server-rendered route subtree.
export function SessionRefresh() {
  return <SessionProvider refetchInterval={15 * 60} refetchOnWindowFocus refetchWhenOffline={false}>{null}</SessionProvider>;
}
