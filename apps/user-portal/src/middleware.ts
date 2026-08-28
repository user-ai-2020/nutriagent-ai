import { NextRequest, NextResponse } from "next/server";

const API_PROXY_TARGET = (process.env.API_PROXY_TARGET || "http://127.0.0.1:3000").replace(/\/$/, "");

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

/**
 * Nothing ever removed entries from rateLimitMap, so every distinct client IP
 * that ever hit the proxy stayed resident for the life of the Next server — a
 * slow, unbounded memory leak on any deployment facing more than a handful of
 * addresses. Sweep expired buckets whenever the map grows past a threshold;
 * that keeps the common path allocation-free.
 */
const RATE_LIMIT_SWEEP_THRESHOLD = 5000;

function sweepExpiredRateLimits(now: number) {
  if (rateLimitMap.size < RATE_LIMIT_SWEEP_THRESHOLD) return;
  for (const [key, entry] of rateLimitMap) {
    if (entry.resetTime <= now) rateLimitMap.delete(key);
  }
}

/** Proxy /api/* and /meal-images/* to the API gateway (same-origin for the browser). */
export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();
  const windowMs = 60000;
  const limit = 100;

  sweepExpiredRateLimits(now);

  const record = rateLimitMap.get(ip);
  if (record && record.resetTime > now) {
    record.count++;
    if (record.count > limit) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  } else {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
  }

  const target = `${API_PROXY_TARGET}${req.nextUrl.pathname}${req.nextUrl.search}`;
  const headers = new Headers(req.headers);
  headers.set("host", new URL(API_PROXY_TARGET).host);

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
  matcher: ["/api/:path*", "/meal-images/:path*"],
};
