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
  const isProtected = protectedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (!isProtected || request.cookies.has("swapit_session")) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
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
