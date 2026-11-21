import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";
import { POST as scan } from "@/app/api/iot/scan/route";

export async function POST(request: NextRequest) {
  const auth = await requireRole(["ADMIN"]);
  if (!auth.success) return auth.response;

  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  }

  const deviceId = process.env.HUB_SCANNER_DEVICE_ID;
  const deviceKey = process.env.HUB_SCANNER_API_KEY;
  if (!deviceId || !deviceKey) {
    return NextResponse.json({ success: false, message: "Hub scanner device credentials are not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof (body as Record<string, unknown>).token !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test((body as { token: string }).token)) {
    return NextResponse.json({ success: false, message: "Invalid SwapIt QR token." }, { status: 400 });
  }

  return scan(new NextRequest(new URL("/api/iot/scan", request.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-device-id": deviceId,
      "x-device-key": deviceKey,
    },
    body: JSON.stringify({ token: (body as { token: string }).token, remoteUnlock: true }),
  }));
}
