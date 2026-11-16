import { NextResponse } from "next/server";
import { can, homePage, pagePermission } from "@/lib/permissions";
import { SESSION_COOKIE, userFromToken } from "@/lib/server/auth";

// Gates the admin pages behind a valid session and the user's role, and sends a signed-in user
// past the login page. The session is checked against the database (not just the cookie's
// presence), so a stale cookie can't bounce between /login and /admin.
export async function proxy(request) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let session = null;
  let checked = true;
  if (token) {
    try {
      session = await userFromToken(token);
    } catch (error) {
      // Database unreachable: keep the user out, but don't throw away a cookie that may be valid.
      console.error("Session check failed", error);
      checked = false;
    }
  }

  if (pathname === "/login") {
    return session ? NextResponse.redirect(new URL(homePage(session.user), request.url)) : NextResponse.next();
  }

  if (!session) {
    const login = new URL("/login", request.url);
    if (pathname !== "/admin") login.searchParams.set("next", pathname + search);
    const response = NextResponse.redirect(login);
    if (token && checked) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  // A page their role doesn't cover: send them to the first page it does.
  const permission = pagePermission(pathname);
  if (permission && !can(session.user, permission)) {
    return NextResponse.redirect(new URL(homePage(session.user), request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/login"],
};
