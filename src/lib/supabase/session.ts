import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { missingSupabaseEnv, supabaseEnvError } from "@/lib/supabase/config";

/** Routes reachable without a session. Everything else requires sign-in. */
const PUBLIC_ROUTES = ["/login", "/signup", "/auth/callback"];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

/**
 * Refreshes the Supabase session cookie on every request and gates access.
 *
 * Note this is an optimistic check only — it keeps signed-out users out of the
 * UI. Route handlers still verify the session themselves via requireUser(),
 * which is what actually protects the data.
 */
export async function updateSession(request: NextRequest) {
  // The proxy runs on every request, so an unconfigured deployment would
  // otherwise return a bare 500 for the entire site with nothing to go on.
  if (missingSupabaseEnv().length > 0) {
    return new NextResponse(supabaseEnvError(), {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Verifies the token signature locally against the cached JWKS rather than
  // calling the Auth server, and still refreshes the cookie when it is stale.
  // getUser() here added a 150-500ms network hop to every page and API request.
  const { data: claims } = await supabase.auth.getClaims();
  const user = claims?.claims?.sub ? { id: claims.claims.sub } : null;

  const { pathname, search } = request.nextUrl;

  // API routes answer with 401 JSON rather than an HTML redirect.
  if (pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  if (!user && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") {
      url.searchParams.set("next", `${pathname}${search}`);
    }
    return redirectPreservingCookies(url, supabaseResponse);
  }

  // Signed-in users have no business on the login/signup screens.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/board";
    url.search = "";
    return redirectPreservingCookies(url, supabaseResponse);
  }

  return supabaseResponse;
}

/**
 * A redirect creates a brand new response, so any refreshed auth cookies set on
 * the original response have to be copied across or the session is lost.
 */
function redirectPreservingCookies(url: URL, from: NextResponse) {
  const response = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}
