import { NextRequest, NextResponse } from "next/server";

const API_PROXY_TARGET = (
  process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000"
).replace(/\/$/, "");

export async function middleware(req: NextRequest) {
  // Auth routes are handled by Next.js API route handlers (BFF)
  if (req.nextUrl.pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const target = `${API_PROXY_TARGET}${req.nextUrl.pathname}${req.nextUrl.search}`;
  const headers = new Headers(req.headers);
  headers.set("host", new URL(API_PROXY_TARGET).host);

  // Inject HttpOnly cookie as Bearer token
  const token = req.cookies.get("nutriagent_token")?.value;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    redirect: "manual",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
    init.duplex = "half";
  }

  try {
    const upstream = await fetch(target, init);
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete("content-encoding");
    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `API proxy failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}

export const config = {
  matcher: ["/api/:path*"],
};
