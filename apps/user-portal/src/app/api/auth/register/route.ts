import { NextRequest, NextResponse } from "next/server";

const API_TARGET = (process.env.API_PROXY_TARGET || "http://127.0.0.1:3000").replace(/\/$/, "");

export async function POST(req: NextRequest) {
  const body = await req.json();
  const upstream = await fetch(`${API_TARGET}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await upstream.json();
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });

  const res = NextResponse.json({ user: data.user });
  res.cookies.set("nutriagent_token", data.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
