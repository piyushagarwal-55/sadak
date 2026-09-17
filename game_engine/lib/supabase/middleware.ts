import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

function isPublicPath(pathname: string): boolean {
  // The world surface is opened dozens of times a day while the simulation is
  // being built, and signing in each time buys nothing. Its own API has to come
  // with it: /play without /api/sim is a page that loads and then 401s on every
  // voice and every turn, which looks like a broken feature rather than a
  // missing session. Gated on NODE_ENV, so a production build cannot reach
  // this branch.
  if (process.env.NODE_ENV !== "production") {
    if (pathname.startsWith("/play") || pathname.startsWith("/api/sim/")) return true;
  }
  return (
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname === "/privacy" ||
    pathname === "/terms"
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (!user && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
