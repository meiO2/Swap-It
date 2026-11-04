import { NextResponse, type NextRequest } from "next/server";

const protectedPaths = [
  "/admin",
  "/profile",
  "/orders",
  "/checkout",
  "/sell",
  "/listings",
  "/wallet",
  "/notifications",
  "/chat",
];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // The admin login page must stay reachable when logged out
  if (pathname === "/admin/login") return NextResponse.next();

  const isProtected = protectedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (!isProtected || request.cookies.has("swapit_session")) return NextResponse.next();

  // Admin routes go to the admin login, everything else to the customer login
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const loginUrl = new URL(isAdmin ? "/admin/login" : "/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/profile/:path*",
    "/orders/:path*",
    "/checkout",
    "/sell",
    "/listings",
    "/wallet",
    "/notifications",
    "/chat/:path*",
  ],
};