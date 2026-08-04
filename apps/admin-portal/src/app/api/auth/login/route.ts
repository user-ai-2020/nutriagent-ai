import { NextRequest, NextResponse } from "next/server";
import { shouldUseSecureCookie } from "@/lib/cookieSecurity";

const API_TARGET = (process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

export async function POST(req: NextRequest) {
  const body = await req.json();
  const upstream = await fetch(`${API_TARGET}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await upstream.json();
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });

  const res = NextResponse.json({ user: data.user });
  res.cookies.set("nutriagent_token", data.token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(req),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
